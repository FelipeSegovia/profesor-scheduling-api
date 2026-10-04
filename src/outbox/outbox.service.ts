import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Identificadores de tipo de correo (inglés; el contenido es en español).
 * Ver `prisma/schema.prisma`, modelo `OutboxEmail`.
 */
export const OutboxKind = {
  BOOKING_PENDING: 'BOOKING_PENDING',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  /** Al apoderado, cuando la educadora mueve una sesión a otro cupo (spec 004). */
  RESCHEDULED: 'RESCHEDULED',
  /** A la educadora, cuando el apoderado confirma por el enlace del correo (spec 004). */
  GUARDIAN_CONFIRMED: 'GUARDIAN_CONFIRMED',
  /** A la educadora, cuando el apoderado cancela (enlace o vencimiento) (spec 004). */
  GUARDIAN_CANCELLED: 'GUARDIAN_CANCELLED',
  /**
   * A la educadora, cuando una reserva pública nace confirmada porque el plazo
   * ya había vencido (spec 006, requisito 7).
   */
  SYSTEM_CONFIRMED: 'SYSTEM_CONFIRMED',
  /**
   * Al apoderado, cuando la educadora agrega un registro a la ficha de su niño
   * y pide enviarlo (spec 007). La fila lleva `clinicalNoteId`, no `sessionId`.
   */
  CLINICAL_NOTE: 'CLINICAL_NOTE',
} as const;

export type OutboxKindValue = (typeof OutboxKind)[keyof typeof OutboxKind];

/**
 * Estados de una fila (spec 006). `PENDING` espera envío o reintento según
 * `nextAttemptAt`; `SKIPPED` es un correo que ya no tiene sentido mandar: al
 * apoderado de una cita que ya ocurrió o quedó sin efecto, o de un registro de
 * la ficha clínica que la educadora borró antes del envío.
 */
export const OutboxStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type OutboxStatusValue =
  (typeof OutboxStatus)[keyof typeof OutboxStatus];

/**
 * Solo hace `INSERT` en `OutboxEmail`, dentro de la misma transacción que el
 * cambio de estado que lo origina — así un fallo del proveedor de correo
 * nunca revierte una reserva. `OutboxDispatcherService` despacha las filas
 * después (spec 006).
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async write(
    params: {
      kind: OutboxKindValue;
      recipient: string;
      sessionId?: string;
      clinicalNoteId?: string;
    },
    tx: Pick<Prisma.TransactionClient, 'outboxEmail'> = this.prisma,
  ): Promise<void> {
    await tx.outboxEmail.create({
      data: {
        kind: params.kind,
        recipient: params.recipient,
        sessionId: params.sessionId,
        clinicalNoteId: params.clinicalNoteId,
      },
    });
  }
}
