import { Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import { TokenService } from '../auth/token.service.js';
import type { CurrentGuardian } from '../auth/guardian-context.middleware.js';
import { buildGuardianProfile, childToDto, guardianToDto, sessionToDto } from '../common/dto.js';
import { DomainError } from '../common/errors/domain-error.js';
import { ErrorMessage } from '../common/errors/messages.js';
import { isSlotTakenViolation } from '../common/prisma/prisma-errors.js';
import { randomToken } from '../common/tokens/random-token.js';
import { normalizeEmail, PASSWORD_MIN_LENGTH } from '../domain/auth.js';
import {
  canCancelSession,
  HELP_REQUEST_MAX_LENGTH,
  hasAllRequiredBookingFields,
  initialSessionStatus,
  normalizeHelpRequest,
  normalizeName,
} from '../domain/booking.js';
import { isPastSlot } from '../domain/time.js';
import { SessionEventsService } from '../events/session-events.service.js';
import { sessionEvent } from '../events/session-events.js';
import { OutboxKind, OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBookingBody } from './bookings.schemas.js';
import type { BookingResult } from './bookings.types.js';

/**
 * Reproduce `public-parents-scheduling-web/src/mocks/db.ts` (`createBooking`,
 * `confirmByToken`, `cancelByToken`, `getBookingBundle`). Ver
 * `.specs/003-reserva-publica/spec.md` para el orden exacto de validaciones.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly tokens: TokenService,
    private readonly events: SessionEventsService,
  ) {}

  async getBookingBundle(sessionId: string): Promise<BookingResult> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new DomainError(ErrorMessage.BOOKING_NOT_FOUND, 404);
    }
    const [guardian, child] = await Promise.all([
      this.prisma.guardian.findUniqueOrThrow({ where: { id: session.guardianId } }),
      this.prisma.child.findUniqueOrThrow({ where: { id: session.childId } }),
    ]);
    return {
      session: sessionToDto(session),
      guardian: guardianToDto(guardian),
      child: childToDto(child),
    };
  }

  async createBooking(
    body: CreateBookingBody,
    currentGuardian?: CurrentGuardian,
  ): Promise<BookingResult> {
    // 1. INVALID_AGE
    const age = Number(body.childAge);
    if (!Number.isInteger(age) || age < 3 || age > 13) {
      throw new DomainError(ErrorMessage.INVALID_AGE, 400, 'INVALID_AGE');
    }

    // 2. MISSING_FIELDS
    if (!hasAllRequiredBookingFields(body)) {
      throw new DomainError(ErrorMessage.MISSING_FIELDS, 400, 'MISSING_FIELDS');
    }

    const email = normalizeEmail(body.email);

    // 3. EMAIL_MISMATCH
    if (currentGuardian && currentGuardian.email !== email) {
      throw new DomainError(ErrorMessage.EMAIL_MISMATCH, 400, 'EMAIL_MISMATCH');
    }

    const emailAccount = await this.prisma.guardian.findUnique({ where: { email } });
    const hasAccount = Boolean(emailAccount?.passwordHash);
    const canUpdateProfile = Boolean(currentGuardian) || !hasAccount;

    // 4 y 5. ACCOUNT_EXISTS / WEAK_PASSWORD
    if (body.createAccount) {
      if (currentGuardian || hasAccount) {
        throw new DomainError(ErrorMessage.ACCOUNT_EXISTS, 409, 'ACCOUNT_EXISTS');
      }
      if (body.createAccount.password.length < PASSWORD_MIN_LENGTH) {
        throw new DomainError(
          ErrorMessage.weakPassword(PASSWORD_MIN_LENGTH),
          400,
          'WEAK_PASSWORD',
        );
      }
    }

    // 6. PAST_SLOT
    if (isPastSlot(body.startsAt)) {
      throw new DomainError(ErrorMessage.PAST_SLOT, 400, 'PAST_SLOT');
    }

    // 7. SLOT_TAKEN — chequeo optimista; la garantía real es el índice único
    // parcial `session_active_slot`, capturado más abajo dentro de la transacción.
    const activeSession = await this.prisma.session.findFirst({
      where: { startsAt: new Date(body.startsAt), status: { in: ['PENDING', 'CONFIRMED'] } },
    });
    if (activeSession) {
      throw new DomainError(ErrorMessage.SLOT_TAKEN, 409, 'SLOT_TAKEN');
    }

    // 8. HELP_REQUEST_TOO_LONG
    const helpRequest = normalizeHelpRequest(body.helpRequest);
    if (helpRequest && helpRequest.length > HELP_REQUEST_MAX_LENGTH) {
      throw new DomainError(
        ErrorMessage.helpRequestTooLong(HELP_REQUEST_MAX_LENGTH),
        400,
        'HELP_REQUEST_TOO_LONG',
      );
    }

    const prefs = await this.prisma.preferences.findUniqueOrThrow({ where: { id: 1 } });
    const status = initialSessionStatus(body.startsAt, prefs.confirmationDeadlineHours);
    const passwordHash = body.createAccount ? await hash(body.createAccount.password) : undefined;
    const normalizedChildName = normalizeName(body.childName);

    const { guardian, child, session } = await this.prisma.$transaction(async (tx) => {
      let guardian = await tx.guardian.findUnique({ where: { email } });
      if (!guardian) {
        guardian = await tx.guardian.create({
          data: {
            name: body.guardianName.trim(),
            email,
            phone: body.phone.trim(),
            passwordHash,
          },
        });
      } else if (canUpdateProfile || passwordHash) {
        guardian = await tx.guardian.update({
          where: { id: guardian.id },
          data: {
            ...(canUpdateProfile
              ? { name: body.guardianName.trim(), phone: body.phone.trim() }
              : {}),
            ...(passwordHash ? { passwordHash } : {}),
          },
        });
      }

      let child = await tx.child.findUnique({
        where: {
          guardianId_normalizedName: { guardianId: guardian.id, normalizedName: normalizedChildName },
        },
      });
      if (!child) {
        child = await tx.child.create({
          data: {
            guardianId: guardian.id,
            name: body.childName.trim().replace(/\s+/g, ' '),
            normalizedName: normalizedChildName,
            age,
          },
        });
      } else if (canUpdateProfile) {
        child = await tx.child.update({ where: { id: child.id }, data: { age } });
      }

      let session;
      try {
        session = await tx.session.create({
          data: {
            childId: child.id,
            guardianId: guardian.id,
            startsAt: new Date(body.startsAt),
            status,
            confirmToken: randomToken(),
            cancelToken: randomToken(),
            helpRequest,
            createdBy: 'GUARDIAN',
          },
        });
      } catch (err) {
        if (isSlotTakenViolation(err)) {
          throw new DomainError(ErrorMessage.SLOT_TAKEN, 409, 'SLOT_TAKEN');
        }
        throw err;
      }

      await this.outbox.write(
        {
          kind: status === 'CONFIRMED' ? OutboxKind.BOOKING_CONFIRMED : OutboxKind.BOOKING_PENDING,
          recipient: guardian.email,
          sessionId: session.id,
        },
        tx,
      );

      if (status === 'CONFIRMED') {
        // La regla canónica avisa a la educadora cuando el sistema deja la cita
        // confirmada porque el plazo ya venció (spec 006, requisito 7). Sin
        // educadora en la base (solo en tests sin seed) la reserva sigue igual.
        const educator = await tx.educator.findFirst();
        if (educator) {
          await this.outbox.write(
            { kind: OutboxKind.SYSTEM_CONFIRMED, recipient: educator.email, sessionId: session.id },
            tx,
          );
        }
      }

      return { guardian, child, session };
    });

    // Después del commit: una reserva que revierte (SLOT_TAKEN) no avisa al panel.
    this.events.emit(
      sessionEvent({
        kind: 'CREATED',
        sessionId: session.id,
        childName: child.name,
        startsAt: session.startsAt,
        actor: 'GUARDIAN',
        at: session.createdAt,
      }),
    );

    const result: BookingResult = {
      session: sessionToDto(session),
      guardian: guardianToDto(guardian),
      child: childToDto(child),
    };

    if (body.createAccount) {
      result.auth = {
        token: await this.tokens.sign(guardian),
        profile: await buildGuardianProfile(this.prisma, guardian.id),
      };
    }

    return result;
  }

  async confirmByToken(confirmToken: string): Promise<BookingResult> {
    const session = await this.prisma.session.findUnique({ where: { confirmToken } });
    if (!session) {
      throw new DomainError(ErrorMessage.INVALID_TOKEN, 404, 'INVALID_TOKEN');
    }
    if (session.status === 'CONFIRMED') {
      return this.getBookingBundle(session.id);
    }
    if (session.status !== 'PENDING') {
      throw new DomainError(ErrorMessage.NOT_PENDING, 409, 'NOT_PENDING');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { status: 'CONFIRMED', statusChangedBy: 'GUARDIAN', statusChangedAt: now },
      });
      const guardian = await tx.guardian.findUniqueOrThrow({ where: { id: session.guardianId } });
      await this.outbox.write(
        { kind: OutboxKind.CONFIRMED, recipient: guardian.email, sessionId: session.id },
        tx,
      );
      // El apoderado confirmó: la educadora no lo hizo ella misma, así que le
      // avisa (regla canónica: solo 2 casos reciben correo). Ver
      // `.specs/004-panel-educadora/spec.md`, requisito 11.
      const educator = await tx.educator.findFirstOrThrow();
      await this.outbox.write(
        { kind: OutboxKind.GUARDIAN_CONFIRMED, recipient: educator.email, sessionId: session.id },
        tx,
      );
    });

    const bundle = await this.getBookingBundle(session.id);
    this.emitStatusChange('CONFIRMED', session, bundle, now);
    return bundle;
  }

  async cancelByToken(cancelToken: string): Promise<BookingResult> {
    const session = await this.prisma.session.findUnique({ where: { cancelToken } });
    if (!session) {
      throw new DomainError(ErrorMessage.INVALID_TOKEN, 404, 'INVALID_TOKEN');
    }
    if (session.status === 'CANCELLED') {
      return this.getBookingBundle(session.id);
    }
    if (!canCancelSession({ startsAt: session.startsAt.toISOString(), status: session.status })) {
      throw new DomainError(ErrorMessage.CANCEL_NOT_ALLOWED, 409, 'CANCEL_NOT_ALLOWED');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { status: 'CANCELLED', statusChangedBy: 'GUARDIAN', statusChangedAt: now },
      });
      const guardian = await tx.guardian.findUniqueOrThrow({ where: { id: session.guardianId } });
      await this.outbox.write(
        { kind: OutboxKind.CANCELLED, recipient: guardian.email, sessionId: session.id },
        tx,
      );
      const educator = await tx.educator.findFirstOrThrow();
      await this.outbox.write(
        { kind: OutboxKind.GUARDIAN_CANCELLED, recipient: educator.email, sessionId: session.id },
        tx,
      );
    });

    const bundle = await this.getBookingBundle(session.id);
    this.emitStatusChange('CANCELLED', session, bundle, now);
    return bundle;
  }

  /** Avisa al panel del cambio de estado hecho por el apoderado (ya con commit). */
  private emitStatusChange(
    kind: 'CONFIRMED' | 'CANCELLED',
    session: { id: string; startsAt: Date },
    bundle: BookingResult,
    at: Date,
  ): void {
    this.events.emit(
      sessionEvent({
        kind,
        sessionId: session.id,
        childName: bundle.child.name,
        startsAt: session.startsAt,
        actor: 'GUARDIAN',
        at,
      }),
    );
  }
}
