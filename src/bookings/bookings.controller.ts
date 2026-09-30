import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentGuardian } from '../auth/guardian.decorator.js';
import type { CurrentGuardian as CurrentGuardianType } from '../auth/guardian-context.middleware.js';
import { ZodValidationPipe } from '../common/validation/zod.pipe.js';
import { createBookingSchema, type CreateBookingBody } from './bookings.schemas.js';
import { BookingsService } from './bookings.service.js';
import type { BookingResult } from './bookings.types.js';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Reservar una sesión suelta' })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Reserva creada.' })
  @ApiResponse({ status: 400, description: 'INVALID_AGE, MISSING_FIELDS, EMAIL_MISMATCH, WEAK_PASSWORD, PAST_SLOT o HELP_REQUEST_TOO_LONG.' })
  @ApiResponse({ status: 409, description: 'ACCOUNT_EXISTS o SLOT_TAKEN.' })
  async create(
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingBody,
    @CurrentGuardian() guardian?: CurrentGuardianType,
  ): Promise<BookingResult> {
    return this.bookings.createBooking(body, guardian);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar una reserva por id' })
  @ApiResponse({ status: 200, description: 'Reserva encontrada.' })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.' })
  async get(@Param('id') id: string): Promise<BookingResult> {
    return this.bookings.getBookingBundle(id);
  }
}
