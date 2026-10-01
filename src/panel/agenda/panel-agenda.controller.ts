import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/validation/zod.pipe.js';
import { EducatorAuthGuard } from '../auth/educator-auth.guard.js';
import { panelAgendaQuerySchema, type PanelAgendaQuery } from './panel-agenda.schemas.js';
import { PanelAgendaService } from './panel-agenda.service.js';
import type { PanelAgendaResponse } from './panel-agenda.types.js';

@ApiTags('panel-agenda')
@ApiBearerAuth()
@UseGuards(EducatorAuthGuard)
@Controller('panel/agenda')
export class PanelAgendaController {
  constructor(private readonly agenda: PanelAgendaService) {}

  @Get()
  @ApiOperation({ summary: 'Agenda semanal (lunes a domingo) de la educadora' })
  @ApiQuery({ name: 'weekStart', required: true, type: String, example: '2026-10-05' })
  @ApiResponse({ status: 200, description: 'Días de la semana con sus cupos.' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR: falta weekStart o no es lunes.' })
  @ApiResponse({ status: 401, description: 'NO_SESSION.' })
  async getWeek(
    @Query(new ZodValidationPipe(panelAgendaQuerySchema)) query: PanelAgendaQuery,
  ): Promise<PanelAgendaResponse> {
    return this.agenda.getWeek(query.weekStart);
  }
}
