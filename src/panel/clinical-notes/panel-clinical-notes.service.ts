import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import { PanelErrorMessage } from '../../common/errors/panel-messages.js';
import { isRecordNotFound } from '../../common/prisma/prisma-errors.js';
import {
  chileDateToColumn,
  columnToChileDate,
  toChileDateString,
  toChileTimeString,
} from '../../domain/time.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OutboxKind, OutboxService } from '../../outbox/outbox.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateNoteBody,
  UpdateNoteBody,
} from './panel-clinical-notes.schemas.js';
import type {
  ChildNotesResponse,
  ClinicalNoteDto,
} from './panel-clinical-notes.types.js';
import {
  pdfFilename,
  renderClinicalRecord,
} from './pdf/render-clinical-record.js';

const WITH_SESSION = { session: true } satisfies Prisma.ClinicalNoteInclude;
type NoteWithSession = Prisma.ClinicalNoteGetPayload<{
  include: typeof WITH_SESSION;
}>;

/**
 * Ficha clínica de un niño (spec 007): registros que escribe la educadora, con
 * correo opcional al apoderado y exportación a PDF. Nada de esto emite eventos
 * SSE ni avisos de campana: lo hace ella misma.
 */
@Injectable()
export class PanelClinicalNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  private toDto(note: NoteWithSession): ClinicalNoteDto {
    return {
      id: note.id,
      childId: note.childId,
      date: columnToChileDate(note.date),
      title: note.title,
      body: note.body,
      sessionId: note.sessionId,
      session: note.session
        ? {
            date: toChileDateString(note.session.startsAt),
            time: toChileTimeString(note.session.startsAt),
            status: note.session.status,
          }
        : null,
      guardianNotified: note.guardianNotified,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  private async findChild(childId: string) {
    const child = await this.prisma.child.findUnique({
      where: { id: childId },
      include: { guardian: true },
    });
    if (!child) {
      throw new DomainError(
        PanelErrorMessage.CHILD_NOT_FOUND,
        404,
        'CHILD_NOT_FOUND',
      );
    }
    return child;
  }

  /** La sesión vinculada tiene que ser del mismo niño (y existir). */
  private async assertSessionOfChild(
    sessionId: string,
    childId: string,
    tx: Pick<Prisma.TransactionClient, 'session'> = this.prisma,
  ): Promise<void> {
    const session = await tx.session.findFirst({
      where: { id: sessionId, childId },
      select: { id: true },
    });
    if (!session) {
      throw new DomainError(
        PanelErrorMessage.NOTE_SESSION_MISMATCH,
        422,
        'NOTE_SESSION_MISMATCH',
      );
    }
  }

  async listForChild(childId: string): Promise<ChildNotesResponse> {
    const child = await this.findChild(childId);
    const notes = await this.prisma.clinicalNote.findMany({
      where: { childId },
      include: WITH_SESSION,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    const { guardian } = child;
    return {
      child: {
        id: child.id,
        guardianId: child.guardianId,
        name: child.name,
        age: child.age,
      },
      guardian: {
        id: guardian.id,
        name: guardian.name,
        email: guardian.email,
        phone: guardian.phone,
      },
      notes: notes.map((n) => this.toDto(n)),
    };
  }

  async create(
    childId: string,
    body: CreateNoteBody,
  ): Promise<ClinicalNoteDto> {
    const child = await this.findChild(childId);
    const note = await this.prisma.$transaction(async (tx) => {
      if (body.sessionId)
        await this.assertSessionOfChild(body.sessionId, childId, tx);
      const created = await tx.clinicalNote.create({
        data: {
          childId,
          date: chileDateToColumn(body.date),
          title: body.title,
          body: body.body,
          sessionId: body.sessionId,
          guardianNotified: body.notifyGuardian,
        },
        include: WITH_SESSION,
      });
      if (body.notifyGuardian) {
        await this.outbox.write(
          {
            kind: OutboxKind.CLINICAL_NOTE,
            recipient: child.guardian.email,
            clinicalNoteId: created.id,
          },
          tx,
        );
      }
      return created;
    });
    return this.toDto(note);
  }

  /** Editar nunca escribe en el outbox: el correo se pide solo al crear. */
  async update(id: string, body: UpdateNoteBody): Promise<ClinicalNoteDto> {
    const existing = await this.prisma.clinicalNote.findUnique({
      where: { id },
    });
    if (!existing) throw this.noteNotFound();
    if (body.sessionId)
      await this.assertSessionOfChild(body.sessionId, existing.childId);
    try {
      const note = await this.prisma.clinicalNote.update({
        where: { id },
        data: {
          date:
            body.date === undefined ? undefined : chileDateToColumn(body.date),
          title: body.title,
          body: body.body,
          sessionId: body.sessionId,
        },
        include: WITH_SESSION,
      });
      return this.toDto(note);
    } catch (err) {
      if (isRecordNotFound(err)) throw this.noteNotFound();
      throw err;
    }
  }

  /** Borrado real. Si el correo aún no salió, el despachador deja la fila `SKIPPED`. */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.clinicalNote.delete({ where: { id } });
    } catch (err) {
      if (isRecordNotFound(err)) throw this.noteNotFound();
      throw err;
    }
  }

  /**
   * PDF con el historial completo, del más antiguo al más reciente. `educator`
   * es quien exporta: su nombre va en el campo «Educadora» y en el pie.
   */
  async exportPdf(
    childId: string,
    now: Date,
    educator: { name: string },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const child = await this.findChild(childId);
    const notes = await this.prisma.clinicalNote.findMany({
      where: { childId },
      include: WITH_SESSION,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const today = toChileDateString(now);
    const buffer = await renderClinicalRecord({
      child: { name: child.name, age: child.age },
      guardian: {
        name: child.guardian.name,
        email: child.guardian.email,
        phone: child.guardian.phone,
      },
      educator: { name: educator.name },
      exportedOn: today,
      notes: notes.map((n) => ({
        date: columnToChileDate(n.date),
        title: n.title,
        body: n.body,
        session: n.session
          ? {
              date: toChileDateString(n.session.startsAt),
              time: toChileTimeString(n.session.startsAt),
            }
          : null,
      })),
    });
    return { buffer, filename: pdfFilename(child.name, today) };
  }

  private noteNotFound(): DomainError {
    return new DomainError(
      PanelErrorMessage.NOTE_NOT_FOUND,
      404,
      'NOTE_NOT_FOUND',
    );
  }
}
