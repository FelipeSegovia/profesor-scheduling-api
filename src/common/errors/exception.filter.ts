import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { DomainError, ErrorCode, type ErrorCodeValue } from './domain-error.js';

/**
 * Forma exacta del contrato público congelado: `{ error, code }`, con `code`
 * ausente (no `null`) cuando no corresponde. Ver
 * `public-parents-scheduling-web/src/mocks/handlers.ts` (`errorResponse`).
 */
type ErrorBody = { error: string; code?: ErrorCodeValue };

/**
 * Filtro global: normaliza cualquier excepción a `{ error, code }` con el
 * status correcto. Un error inesperado (500) nunca expone su detalle al
 * cliente — va solo al log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const { status, body } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        body: exception.code
          ? { error: exception.message, code: exception.code }
          : { error: exception.message },
      };
    }

    if (exception instanceof ZodError) {
      const first = exception.issues[0];
      return {
        status: 400,
        body: {
          error: first?.message ?? 'Datos inválidos.',
          code: ErrorCode.VALIDATION_ERROR,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ??
            exception.message);
      return {
        status,
        body: {
          error: Array.isArray(message) ? message.join(' ') : message,
          code: status === 404 ? ErrorCode.NOT_FOUND : ErrorCode.INTERNAL_ERROR,
        },
      };
    }

    return {
      status: 500,
      body: {
        error: 'Ocurrió un error inesperado. Intenta nuevamente.',
        code: ErrorCode.INTERNAL_ERROR,
      },
    };
  }
}
