import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError } from '../common/errors/domain-error.js';
import { ErrorMessage } from '../common/errors/messages.js';
import { SlotsService } from './slots.service.js';
import type { SlotView } from './slots.types.js';

@ApiTags('slots')
@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  /**
   * `weekStart` se valida a mano, fuera de `ZodValidationPipe`: el mensaje
   * `"Falta weekStart"` del contrato congelado no lleva `code`, y el pipe
   * siempre añade `VALIDATION_ERROR`. Ver `.specs/003-reserva-publica/plan.md`.
   */
  @Get()
  @ApiOperation({ summary: 'Cupos de lunes a sábado para la semana de `weekStart`' })
  @ApiQuery({ name: 'weekStart', required: true, type: String, example: '2026-10-05' })
  @ApiResponse({ status: 200, description: 'Cupos de la semana solicitada.' })
  @ApiResponse({ status: 400, description: 'Falta el parámetro `weekStart`.' })
  async list(@Query('weekStart') weekStart?: string): Promise<{ slots: SlotView[] }> {
    if (!weekStart) {
      throw new DomainError(ErrorMessage.MISSING_WEEK_START, 400);
    }
    return { slots: await this.slots.buildWeekSlots(weekStart) };
  }
}
