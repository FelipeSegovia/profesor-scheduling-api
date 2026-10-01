import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/validation/zod.pipe.js';
import { EducatorAuthGuard } from '../auth/educator-auth.guard.js';
import { panelSummaryQuerySchema, type PanelSummaryQuery } from './panel-dashboard.schemas.js';
import { PanelDashboardService } from './panel-dashboard.service.js';
import type { PanelSummaryResponse } from './panel-dashboard.types.js';

@ApiTags('panel-summary')
@ApiBearerAuth()
@UseGuards(EducatorAuthGuard)
@Controller('panel/summary')
export class PanelDashboardController {
  constructor(private readonly dashboard: PanelDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Resumen del día para la educadora' })
  @ApiQuery({ name: 'date', required: false, type: String, example: '2026-10-05' })
  @ApiResponse({ status: 200, description: 'Resumen del día pedido (hoy por defecto).' })
  @ApiResponse({ status: 401, description: 'NO_SESSION.' })
  async get(
    @Query(new ZodValidationPipe(panelSummaryQuerySchema)) query: PanelSummaryQuery,
  ): Promise<PanelSummaryResponse> {
    return this.dashboard.getSummary(query.date);
  }
}
