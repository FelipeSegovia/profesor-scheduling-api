import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/validation/zod.pipe.js';
import { EducatorAuthGuard } from '../auth/educator-auth.guard.js';
import type { CurrentEducator as CurrentEducatorType } from '../auth/educator-context.middleware.js';
import { CurrentEducator } from '../auth/educator.decorator.js';
import {
  createNoteSchema,
  updateNoteSchema,
  type CreateNoteBody,
  type UpdateNoteBody,
} from './panel-clinical-notes.schemas.js';
import { PanelClinicalNotesService } from './panel-clinical-notes.service.js';
import type {
  ChildNotesResponse,
  ClinicalNoteDto,
} from './panel-clinical-notes.types.js';

/** Ficha clínica por niño (spec 007). */
@ApiTags('panel-clinical-notes')
@ApiBearerAuth()
@UseGuards(EducatorAuthGuard)
@Controller('panel')
export class PanelClinicalNotesController {
  constructor(private readonly notes: PanelClinicalNotesService) {}

  // `notes.pdf` va antes que `notes`: son rutas distintas, pero así no depende del router.
  @Get('children/:id/notes.pdf')
  @ApiOperation({
    summary: 'Exportar en PDF el historial completo de la ficha de un niño',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({
    status: 200,
    description:
      'PDF con todos los registros, del más antiguo al más reciente.',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 404, description: 'CHILD_NOT_FOUND.' })
  async pdf(
    @Param('id') id: string,
    @CurrentEducator() educator?: CurrentEducatorType,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.notes.exportPdf(id, new Date(), {
      name: educator!.name,
    });
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get('children/:id/notes')
  @ApiOperation({ summary: 'Listar los registros de la ficha de un niño' })
  @ApiResponse({
    status: 200,
    description: 'Niño, apoderado y registros (el más reciente primero).',
  })
  @ApiResponse({ status: 404, description: 'CHILD_NOT_FOUND.' })
  async list(@Param('id') id: string): Promise<ChildNotesResponse> {
    return this.notes.listForChild(id);
  }

  @Post('children/:id/notes')
  @ApiOperation({
    summary:
      'Agregar un registro a la ficha de un niño (con correo opcional al apoderado)',
  })
  @ApiResponse({ status: 201, description: 'Registro creado.' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR.' })
  @ApiResponse({ status: 404, description: 'CHILD_NOT_FOUND.' })
  @ApiResponse({ status: 422, description: 'NOTE_SESSION_MISMATCH.' })
  async create(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createNoteSchema)) body: CreateNoteBody,
  ): Promise<ClinicalNoteDto> {
    return this.notes.create(id, body);
  }

  @Patch('notes/:id')
  @ApiOperation({
    summary: 'Editar un registro de la ficha (no reenvía el correo)',
  })
  @ApiResponse({ status: 200, description: 'Registro actualizado.' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR.' })
  @ApiResponse({ status: 404, description: 'NOTE_NOT_FOUND.' })
  @ApiResponse({ status: 422, description: 'NOTE_SESSION_MISMATCH.' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateNoteSchema)) body: UpdateNoteBody,
  ): Promise<ClinicalNoteDto> {
    return this.notes.update(id, body);
  }

  @Delete('notes/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borrar un registro de la ficha' })
  @ApiResponse({ status: 204, description: 'Registro borrado.' })
  @ApiResponse({ status: 404, description: 'NOTE_NOT_FOUND.' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.notes.remove(id);
  }
}
