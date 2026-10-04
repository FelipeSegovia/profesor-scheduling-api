import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Env } from '../config/env.js';
import { EMAIL_SENDER, type EmailSender } from '../email/email-sender.js';
import { renderEmail } from '../email/render-email.js';
import type { OutboxEmail } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildClinicalNoteMessage, buildMessage } from './outbox-message.js';
import { OutboxKind, OutboxStatus } from './outbox.service.js';
import { nextAttempt } from './retry.js';

/** Filas por ciclo. Se envían en serie, por el rate limit de Resend. */
export const DISPATCH_BATCH_SIZE = 20;
/** Plazo por defecto si no hay fila `Preferences` (solo pasa en tests). */
const DEFAULT_CONFIRMATION_DEADLINE_HOURS = 24;
const ERROR_MAX_LENGTH = 500;

export interface DispatchResult {
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
}

/**
 * Despacha las filas `PENDING` de `OutboxEmail` (spec 006). Corre cada
 * `OUTBOX_POLL_INTERVAL_MS` sin solaparse; con `NODE_ENV=test` no se registra
 * y los e2e llaman `dispatchOnce()` a mano.
 *
 * Un solo proceso: con varias instancias de la API dos ciclos podrían tomar la
 * misma fila (haría falta `FOR UPDATE SKIP LOCKED`). La `idempotencyKey`
 * (= `id` de la fila) evita igual que Resend mande el correo dos veces.
 */
@Injectable()
export class OutboxDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
  ) {}

  onModuleInit(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    const ms = this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true });
    // `SchedulerRegistry` limpia el intervalo al cerrar la app.
    this.scheduler.addInterval(
      'outbox-dispatch',
      setInterval(() => void this.tick(), ms),
    );
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.dispatchOnce();
      if (result.sent + result.retried + result.failed + result.skipped > 0) {
        this.logger.log(
          `Outbox: ${result.sent} enviados, ${result.retried} por reintentar, ${result.failed} fallidos, ${result.skipped} omitidos.`,
        );
      }
    } catch (err) {
      this.logger.error(`Falló el ciclo del outbox: ${errorMessage(err)}`);
    } finally {
      this.running = false;
    }
  }

  /** Procesa un lote. `now` es parámetro para poder probar el backoff. */
  async dispatchOnce(now = new Date()): Promise<DispatchResult> {
    const rows = await this.prisma.outboxEmail.findMany({
      where: { status: OutboxStatus.PENDING, nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: DISPATCH_BATCH_SIZE,
    });
    const result: DispatchResult = {
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
    };
    if (rows.length === 0) return result;

    const prefs = await this.prisma.preferences.findUnique({
      where: { id: 1 },
    });
    const ctx = {
      baseUrl: this.config.get('PUBLIC_WEB_URL', { infer: true }),
      confirmationDeadlineHours:
        prefs?.confirmationDeadlineHours ?? DEFAULT_CONFIRMATION_DEADLINE_HOURS,
      now,
    };

    for (const row of rows) {
      result[await this.processRow(row, ctx)]++;
    }
    return result;
  }

  private async processRow(
    row: OutboxEmail,
    ctx: Parameters<typeof buildMessage>[2],
  ): Promise<keyof DispatchResult> {
    try {
      const decision = await this.decide(row, ctx);

      if (decision.action === 'skip') {
        await this.update(row.id, {
          status: OutboxStatus.SKIPPED,
          error: decision.reason,
        });
        return 'skipped';
      }
      if (decision.action === 'fail') {
        await this.update(row.id, {
          status: OutboxStatus.FAILED,
          attempts: row.attempts + 1,
          error: decision.error,
        });
        return 'failed';
      }

      const email = await renderEmail(decision.message);
      // `row.recipient` y no el email actual del apoderado: es el destinatario
      // que fijó la transacción que escribió la fila.
      const { providerId } = await this.sender.send({
        ...email,
        to: row.recipient,
        idempotencyKey: row.id,
      });
      await this.update(row.id, {
        status: OutboxStatus.SENT,
        attempts: row.attempts + 1,
        sentAt: ctx.now,
        providerId,
        error: null,
      });
      return 'sent';
    } catch (err) {
      const attempts = row.attempts + 1;
      const retry = nextAttempt(attempts, ctx.now);
      await this.update(row.id, {
        attempts,
        error: errorMessage(err).slice(0, ERROR_MAX_LENGTH),
        ...retry,
      });
      this.logger.warn(
        `No se pudo enviar el correo ${row.id} (${row.kind}, intento ${attempts}): ${errorMessage(err)}`,
      );
      return retry.status === 'FAILED' ? 'failed' : 'retried';
    }
  }

  /** Carga lo que el correo de la fila necesita y decide qué hacer con ella. */
  private async decide(
    row: OutboxEmail,
    ctx: Parameters<typeof buildMessage>[2],
  ): Promise<ReturnType<typeof buildMessage>> {
    if (row.kind === OutboxKind.CLINICAL_NOTE) {
      const note = row.clinicalNoteId
        ? await this.prisma.clinicalNote.findUnique({
            where: { id: row.clinicalNoteId },
            include: { child: { include: { guardian: true } } },
          })
        : null;
      return buildClinicalNoteMessage(note);
    }
    const session = row.sessionId
      ? await this.prisma.session.findUnique({
          where: { id: row.sessionId },
          include: { child: true, guardian: true },
        })
      : null;
    return buildMessage(row.kind, session, ctx);
  }

  private async update(
    id: string,
    data: Partial<
      Pick<
        OutboxEmail,
        | 'status'
        | 'attempts'
        | 'error'
        | 'sentAt'
        | 'providerId'
        | 'nextAttemptAt'
      >
    >,
  ): Promise<void> {
    await this.prisma.outboxEmail.update({ where: { id }, data });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
