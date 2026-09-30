import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Prueba de vida de la API y de su conexión a Postgres. `SELECT 1` es
   * intencionalmente trivial: solo confirma que la base responde, no revisa
   * el estado del dominio.
   */
  @Get()
  @ApiOperation({ summary: 'Estado de la API y de su conexión a la base de datos' })
  @ApiResponse({ status: 200, description: 'La API y la base de datos responden.' })
  @ApiResponse({ status: 503, description: 'La base de datos no responde.' })
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('La base de datos no responde.');
    }
  }
}
