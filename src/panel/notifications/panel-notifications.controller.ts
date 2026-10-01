import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EducatorAuthGuard } from '../auth/educator-auth.guard.js';
import type { CurrentEducator as CurrentEducatorType } from '../auth/educator-context.middleware.js';
import { CurrentEducator } from '../auth/educator.decorator.js';
import { PanelNotificationsService } from './panel-notifications.service.js';
import type { PanelNotificationsResponse } from './panel-notifications.types.js';

@ApiTags('panel-notifications')
@ApiBearerAuth()
@UseGuards(EducatorAuthGuard)
@Controller('panel/notifications')
export class PanelNotificationsController {
  constructor(private readonly notifications: PanelNotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Avisos de la campana: lo que hicieron apoderados o el sistema' })
  @ApiResponse({ status: 200, description: 'Hasta 20 avisos recientes y el total de no leídos.' })
  @ApiResponse({ status: 401, description: 'NO_SESSION.' })
  async list(
    @CurrentEducator() educator?: CurrentEducatorType,
  ): Promise<PanelNotificationsResponse> {
    return this.notifications.list(educator!.id);
  }

  @Post('seen')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marcar todos los avisos como vistos' })
  @ApiResponse({ status: 204, description: 'Avisos marcados como vistos.' })
  @ApiResponse({ status: 401, description: 'NO_SESSION.' })
  async markSeen(@CurrentEducator() educator?: CurrentEducatorType): Promise<void> {
    await this.notifications.markSeen(educator!.id);
  }
}
