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
} as const;

export type OutboxKindValue = (typeof OutboxKind)[keyof typeof OutboxKind];

/**
 * Solo hace `INSERT` en `OutboxEmail`, dentro de la misma transacción que el
 * cambio de estado que lo origina — así un fallo del proveedor de correo
 * (spec futura) nunca revierte una reserva. Ningún proceso despacha estas
 * filas todavía: eso es la spec de "vencimiento de confirmación con su job".
 * Ver `.specs/003-reserva-publica/spec.md`, sección "Fuera de alcance".
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async write(
    params: { kind: OutboxKindValue; recipient: string; sessionId?: string },
    tx: Pick<Prisma.TransactionClient, 'outboxEmail'> = this.prisma,
  ): Promise<void> {
    await tx.outboxEmail.create({
      data: {
        kind: params.kind,
        recipient: params.recipient,
        sessionId: params.sessionId,
      },
    });
  }
}
