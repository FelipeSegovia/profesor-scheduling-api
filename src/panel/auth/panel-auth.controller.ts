import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/validation/zod.pipe.js';
import { CurrentEducator } from './educator.decorator.js';
import type { CurrentEducator as CurrentEducatorType } from './educator-context.middleware.js';
import { EducatorAuthGuard } from './educator-auth.guard.js';
import { PanelAuthService } from './panel-auth.service.js';
import {
  panelLoginSchema,
  panelPasswordSchema,
  type PanelLoginBody,
  type PanelPasswordBody,
} from './panel-auth.schemas.js';
import type { EducatorProfile, PanelAuthResult } from './panel-auth.types.js';

@ApiTags('panel-auth')
@Controller('panel/auth')
export class PanelAuthController {
  constructor(private readonly auth: PanelAuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión como educadora' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada.' })
  @ApiResponse({ status: 400, description: 'MISSING_FIELDS.' })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS.' })
  async login(
    @Body(new ZodValidationPipe(panelLoginSchema)) body: PanelLoginBody,
  ): Promise<PanelAuthResult> {
    return this.auth.login(body);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(EducatorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión de la educadora (siempre 204)' })
  @ApiResponse({ status: 204, description: 'Sesión cerrada.' })
  @ApiResponse({ status: 401, description: 'NO_SESSION.' })
  logout(): void {
    // JWT sin estado: no hay nada que invalidar del lado del servidor acá.
  }

  @Get('me')
  @UseGuards(EducatorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil de la educadora con sesión activa' })
  @ApiResponse({ status: 200, description: 'Perfil de la educadora.' })
  @ApiResponse({ status: 401, description: 'NO_SESSION.' })
  async me(@CurrentEducator() educator?: CurrentEducatorType): Promise<{ educator: EducatorProfile }> {
    return this.auth.me(educator!.id);
  }

  @Post('password')
  @HttpCode(200)
  @UseGuards(EducatorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar la clave de la educadora' })
  @ApiResponse({ status: 200, description: 'Clave cambiada; token nuevo.' })
  @ApiResponse({ status: 400, description: 'WEAK_PASSWORD.' })
  @ApiResponse({ status: 401, description: 'NO_SESSION o INVALID_CREDENTIALS (clave actual incorrecta).' })
  async changePassword(
    @CurrentEducator() educator: CurrentEducatorType | undefined,
    @Body(new ZodValidationPipe(panelPasswordSchema)) body: PanelPasswordBody,
  ): Promise<{ token: string }> {
    return this.auth.changePassword(educator!.id, body);
  }
}
