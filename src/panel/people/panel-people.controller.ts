import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/validation/zod.pipe.js';
import { EducatorAuthGuard } from '../auth/educator-auth.guard.js';
import {
  createChildSchema,
  createGuardianSchema,
  updateChildSchema,
  updateGuardianSchema,
  type CreateChildBody,
  type CreateGuardianBody,
  type UpdateChildBody,
  type UpdateGuardianBody,
} from './panel-people.schemas.js';
import { PanelPeopleService } from './panel-people.service.js';
import type {
  PanelChildDto,
  PanelGuardianDetail,
  PanelGuardianDto,
  PanelGuardianListItem,
} from './panel-people.types.js';

@ApiTags('panel-people')
@ApiBearerAuth()
@UseGuards(EducatorAuthGuard)
@Controller('panel')
export class PanelPeopleController {
  constructor(private readonly people: PanelPeopleService) {}

  @Get('guardians')
  @ApiOperation({ summary: 'Listar apoderados (con conteo de niños y sesiones activas)' })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de apoderados.' })
  async list(@Query('query') query?: string): Promise<{ guardians: PanelGuardianListItem[] }> {
    return { guardians: await this.people.listGuardians(query) };
  }

  @Get('guardians/:id')
  @ApiOperation({ summary: 'Ficha de un apoderado: sus niños y el histórico de sesiones' })
  @ApiResponse({ status: 200, description: 'Ficha del apoderado.' })
  @ApiResponse({ status: 404, description: 'GUARDIAN_NOT_FOUND.' })
  async get(@Param('id') id: string): Promise<PanelGuardianDetail> {
    return this.people.getGuardian(id);
  }

  @Post('guardians')
  @ApiOperation({ summary: 'Crear una ficha de apoderado' })
  @ApiResponse({ status: 201, description: 'Apoderado creado.' })
  @ApiResponse({ status: 409, description: 'GUARDIAN_EXISTS.' })
  async create(
    @Body(new ZodValidationPipe(createGuardianSchema)) body: CreateGuardianBody,
  ): Promise<PanelGuardianDto> {
    return this.people.createGuardian(body);
  }

  @Patch('guardians/:id')
  @ApiOperation({ summary: 'Actualizar nombre o teléfono de un apoderado' })
  @ApiResponse({ status: 200, description: 'Apoderado actualizado.' })
  @ApiResponse({ status: 404, description: 'GUARDIAN_NOT_FOUND.' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGuardianSchema)) body: UpdateGuardianBody,
  ): Promise<PanelGuardianDto> {
    return this.people.updateGuardian(id, body);
  }

  @Post('guardians/:id/children')
  @ApiOperation({ summary: 'Agregar un niño a la ficha de un apoderado (sin rango de edad)' })
  @ApiResponse({ status: 201, description: 'Niño creado.' })
  @ApiResponse({ status: 404, description: 'GUARDIAN_NOT_FOUND.' })
  @ApiResponse({ status: 409, description: 'CHILD_EXISTS.' })
  async createChild(
    @Param('id') guardianId: string,
    @Body(new ZodValidationPipe(createChildSchema)) body: CreateChildBody,
  ): Promise<PanelChildDto> {
    return this.people.createChild(guardianId, body);
  }

  @Patch('children/:id')
  @ApiOperation({ summary: 'Actualizar nombre o edad de un niño' })
  @ApiResponse({ status: 200, description: 'Niño actualizado.' })
  @ApiResponse({ status: 404, description: 'CHILD_NOT_FOUND.' })
  async updateChild(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateChildSchema)) body: UpdateChildBody,
  ): Promise<PanelChildDto> {
    return this.people.updateChild(id, body);
  }
}
