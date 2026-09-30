import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service.js';
import type { BookingResult } from './bookings.types.js';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('confirm/:token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmar una sesión pendiente' })
  @ApiResponse({ status: 200, description: 'Sesión confirmada (idempotente si ya lo estaba).' })
  @ApiResponse({ status: 404, description: 'INVALID_TOKEN.' })
  @ApiResponse({ status: 409, description: 'NOT_PENDING.' })
  async confirm(@Param('token') token: string): Promise<BookingResult> {
    return this.bookings.confirmByToken(token);
  }

  @Post('cancel/:token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancelar una sesión' })
  @ApiResponse({ status: 200, description: 'Sesión cancelada (idempotente si ya lo estaba).' })
  @ApiResponse({ status: 404, description: 'INVALID_TOKEN.' })
  @ApiResponse({ status: 409, description: 'CANCEL_NOT_ALLOWED.' })
  async cancel(@Param('token') token: string): Promise<BookingResult> {
    return this.bookings.cancelByToken(token);
  }
}
