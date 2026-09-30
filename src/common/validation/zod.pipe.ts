import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida el cuerpo o los query params de una ruta contra un esquema Zod. No
 * atrapa el `ZodError`: lo deja pasar para que `AllExceptionsFilter` lo
 * traduzca al formato `{ error, code }` del contrato congelado.
 *
 * Uso: `@Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingDto`.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
