import { Body, Controller, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/validation/zod.pipe.js';
import { EducatorAuthGuard } from '../auth/educator-auth.guard.js';
import type { PanelSessionDto } from '../panel.dto.js';
import {
  createSeriesSchema,
  createSessionSchema,
  moveSessionSchema,
  type CreateSeriesBody,
  type CreateSessionBody,
  type MoveSessionBody,
} from './panel-sessions.schemas.js';
import { PanelSessionsService } from './panel-sessions.service.js';
import type { CreateSeriesResult } from './panel-sessions.types.js';

@ApiTags('panel-sessions')
@ApiBearerAuth()
@UseGuards(EducatorAuthGuard)
@Controller('panel')
export class PanelSessionsController {
  constructor(private readonly sessions: PanelSessionsService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Crear una cita única' })
  @ApiResponse({ status: 201, description: 'Sesión creada.' })
  @ApiResponse({ status: 400, description: 'PAST_SLOT.' })
  @ApiResponse({ status: 404, description: 'CHILD_NOT_FOUND.' })
  @ApiResponse({ status: 409, description: 'SLOT_BLOCKED o SLOT_TAKEN.' })
  async create(
    @Body(new ZodValidationPipe(createSessionSchema)) body: CreateSessionBody,
  ): Promise<PanelSessionDto> {
    return this.sessions.createSession(body);
  }

  @Post('series')
  @ApiOperation({ summary: 'Crear una serie semanal, saltando fechas ocupadas o bloqueadas' })
  @ApiResponse({ status: 201, description: 'Serie creada, con las fechas omitidas listadas.' })
  @ApiResponse({ status: 400, description: 'SERIES_EMPTY.' })
  @ApiResponse({ status: 404, description: 'CHILD_NOT_FOUND.' })
  async createSeries(
    @Body(new ZodValidationPipe(createSeriesSchema)) body: CreateSeriesBody,
  ): Promise<CreateSeriesResult> {
    return this.sessions.createSeries(body);
  }

  @Patch('sessions/:id/move')
  @ApiOperation({ summary: 'Mover una sesión a otro cupo' })
  @ApiResponse({ status: 200, description: 'Sesión movida.' })
  @ApiResponse({ status: 400, description: 'PAST_SLOT.' })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND.' })
  @ApiResponse({ status: 409, description: 'CANCEL_NOT_ALLOWED, SLOT_BLOCKED o SLOT_TAKEN.' })
  async move(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveSessionSchema)) body: MoveSessionBody,
  ): Promise<PanelSessionDto> {
    return this.sessions.move(id, body);
  }

  @Post('sessions/:id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marcar una sesión como confirmada a mano' })
  @ApiResponse({ status: 200, description: 'Sesión confirmada.' })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND.' })
  @ApiResponse({ status: 409, description: 'NOT_PENDING.' })
  async confirm(@Param('id') id: string): Promise<PanelSessionDto> {
    return this.sessions.confirm(id);
  }

  @Post('sessions/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancelar una sesión' })
  @ApiResponse({ status: 200, description: 'Sesión cancelada.' })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND.' })
  @ApiResponse({ status: 409, description: 'CANCEL_NOT_ALLOWED.' })
  async cancel(@Param('id') id: string): Promise<PanelSessionDto> {
    return this.sessions.cancel(id);
  }
}
