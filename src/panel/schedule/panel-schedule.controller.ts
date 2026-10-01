import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/validation/zod.pipe.js';
import { EducatorAuthGuard } from '../auth/educator-auth.guard.js';
import {
  blockDaySchema,
  blockSlotSchema,
  updatePreferencesSchema,
  updateTemplateSchema,
  type BlockDayBody,
  type BlockSlotBody,
  type UpdatePreferencesBody,
  type UpdateTemplateBody,
} from './panel-schedule.schemas.js';
import { PanelScheduleService } from './panel-schedule.service.js';
import type { PanelPreferencesResponse, UpdateTemplateResult } from './panel-schedule.types.js';

@ApiTags('panel-schedule')
@ApiBearerAuth()
@UseGuards(EducatorAuthGuard)
@Controller('panel')
export class PanelScheduleController {
  constructor(private readonly schedule: PanelScheduleService) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Plantilla semanal y plazos configurables' })
  @ApiResponse({ status: 200, description: 'Preferencias vigentes.' })
  @ApiResponse({ status: 401, description: 'NO_SESSION.' })
  async get(): Promise<PanelPreferencesResponse> {
    return this.schedule.getPreferences();
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Actualizar el plazo de confirmación, la antelación de serie y el horizonte de reserva' })
  @ApiResponse({ status: 200, description: 'Preferencias actualizadas.' })
  @ApiResponse({ status: 400, description: 'INVALID_PREFERENCES o INVALID_RANGE.' })
  async updatePreferences(
    @Body(new ZodValidationPipe(updatePreferencesSchema)) body: UpdatePreferencesBody,
  ): Promise<PanelPreferencesResponse> {
    return this.schedule.updatePreferences(body);
  }

  @Put('template')
  @ApiOperation({ summary: 'Reemplazar la plantilla semanal completa' })
  @ApiResponse({ status: 200, description: 'Plantilla actualizada; las sesiones existentes no se tocan.' })
  async replaceTemplate(
    @Body(new ZodValidationPipe(updateTemplateSchema)) body: UpdateTemplateBody,
  ): Promise<UpdateTemplateResult> {
    return this.schedule.replaceTemplate(body);
  }

  @Post('blocks/day')
  @ApiOperation({ summary: 'Bloquear un día completo (solo si no tiene sesiones activas)' })
  @ApiResponse({ status: 201, description: 'Día bloqueado.' })
  @ApiResponse({ status: 409, description: 'SLOT_NOT_EMPTY.' })
  async blockDay(@Body(new ZodValidationPipe(blockDaySchema)) body: BlockDayBody): Promise<void> {
    return this.schedule.blockDay(body);
  }

  @Delete('blocks/day/:date')
  @HttpCode(204)
  @ApiOperation({ summary: 'Desbloquear un día (204 aunque no estuviera bloqueado)' })
  @ApiResponse({ status: 204, description: 'Día desbloqueado.' })
  async unblockDay(@Param('date') date: string): Promise<void> {
    return this.schedule.unblockDay(date);
  }

  @Post('blocks/slot')
  @ApiOperation({ summary: 'Bloquear un cupo puntual (solo si está vacío)' })
  @ApiResponse({ status: 201, description: 'Cupo bloqueado.' })
  @ApiResponse({ status: 409, description: 'SLOT_NOT_EMPTY.' })
  async blockSlot(@Body(new ZodValidationPipe(blockSlotSchema)) body: BlockSlotBody): Promise<void> {
    return this.schedule.blockSlot(body);
  }

  @Delete('blocks/slot/:date/:time')
  @HttpCode(204)
  @ApiOperation({ summary: 'Desbloquear un cupo (204 aunque no estuviera bloqueado)' })
  @ApiResponse({ status: 204, description: 'Cupo desbloqueado.' })
  async unblockSlot(@Param('date') date: string, @Param('time') time: string): Promise<void> {
    return this.schedule.unblockSlot(date, time);
  }
}
