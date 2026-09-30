import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { buildGuardianProfile } from '../common/dto.js';
import { ZodValidationPipe } from '../common/validation/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import {
  forgotSchema,
  loginSchema,
  registerSchema,
  resetSchema,
  type ForgotBody,
  type LoginBody,
  type RegisterBody,
  type ResetBody,
} from './auth.schemas.js';
import type { AuthResult, GuardianProfile } from './auth.types.js';
import { CurrentGuardian } from './guardian.decorator.js';
import type { CurrentGuardian as CurrentGuardianType } from './guardian-context.middleware.js';
import { GuardianAuthGuard } from './guardian-auth.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Crear la cuenta opcional del apoderado' })
  @ApiResponse({ status: 201, description: 'Cuenta creada.' })
  @ApiResponse({ status: 400, description: 'WEAK_PASSWORD o MISSING_FIELDS.' })
  @ApiResponse({ status: 409, description: 'ACCOUNT_EXISTS.' })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterBody,
  ): Promise<AuthResult> {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión con la cuenta opcional' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada.' })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS.' })
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginBody): Promise<AuthResult> {
    return this.auth.login(body);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cerrar sesión (siempre 204, con o sin sesión válida)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 204, description: 'Sesión cerrada.' })
  logout(): void {
    // JWT sin estado: no hay nada que invalidar del lado del servidor acá.
    // Ver `.specs/003-reserva-publica/plan.md`, sección "Invalidar sesiones".
  }

  @Get('me')
  @UseGuards(GuardianAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil de la cuenta con sesión activa' })
  @ApiResponse({ status: 200, description: 'Perfil del apoderado.' })
  @ApiResponse({ status: 401, description: 'NO_SESSION.' })
  async me(@CurrentGuardian() guardian?: CurrentGuardianType): Promise<{ profile: GuardianProfile }> {
    return { profile: await buildGuardianProfile(this.prisma, guardian!.id) };
  }

  @Get('email-status')
  @ApiOperation({ summary: 'Si un correo ya tiene cuenta' })
  @ApiQuery({ name: 'email', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Siempre responde, nunca falla.' })
  async emailStatus(@Query('email') email = ''): Promise<{ hasAccount: boolean }> {
    return { hasAccount: await this.auth.emailHasAccount(email) };
  }

  @Post('forgot')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pedir un enlace de recuperación de clave' })
  @ApiResponse({ status: 200, description: 'Siempre `{ ok: true }`, nunca filtra si el correo tiene cuenta.' })
  async forgot(
    @Body(new ZodValidationPipe(forgotSchema)) body: ForgotBody,
  ): Promise<{ ok: true; devResetToken?: string }> {
    return this.auth.forgot(body);
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restablecer la clave con el token del correo' })
  @ApiResponse({ status: 200, description: 'Clave restablecida; sesión iniciada.' })
  @ApiResponse({ status: 400, description: 'INVALID_RESET o WEAK_PASSWORD.' })
  @ApiResponse({ status: 404, description: 'NO_ACCOUNT.' })
  async reset(@Body(new ZodValidationPipe(resetSchema)) body: ResetBody): Promise<AuthResult> {
    return this.auth.reset(body);
  }
}
