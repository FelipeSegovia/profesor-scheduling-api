import { Controller, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { interval, map, merge, type Observable } from 'rxjs';
import { SessionEventsService } from '../../events/session-events.service.js';
import { EducatorAuthGuard } from '../auth/educator-auth.guard.js';

/** Cada cuánto se manda un `ping`, para que un proxy no corte la conexión ociosa. */
export const PING_INTERVAL_MS = 25_000;

/**
 * Stream de Server-Sent Events con los cambios de sesiones. El cliente lo abre
 * con `fetch` y `Authorization: Bearer` (no `EventSource`, que no admite
 * headers), así el token nunca viaja en la URL. El guard corre antes de abrir
 * el stream: sin sesión de educadora responde 401 JSON normal. Ver
 * `.specs/005-avisos-tiempo-real/spec.md`.
 */
@ApiTags('panel-events')
@ApiBearerAuth()
@UseGuards(EducatorAuthGuard)
@Controller('panel/events')
export class PanelEventsController {
  constructor(private readonly events: SessionEventsService) {}

  @Sse()
  @ApiOperation({
    summary: 'Stream en tiempo real de cambios de sesiones (Server-Sent Events)',
    description:
      'Emite `event: session` con un `SessionEvent` por cada sesión creada o cambiada, y ' +
      '`event: ping` cada 25 s. No reenvía eventos perdidos: al reconectar, volver a pedir ' +
      'resumen, agenda y notificaciones.',
  })
  @ApiProduces('text/event-stream')
  @ApiResponse({ status: 200, description: 'Stream abierto (`text/event-stream`).' })
  @ApiResponse({ status: 401, description: 'NO_SESSION.' })
  stream(): Observable<MessageEvent> {
    return merge(
      this.events.stream().pipe(map((e): MessageEvent => ({ type: 'session', id: e.id, data: e }))),
      interval(PING_INTERVAL_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: {} }))),
    );
  }
}
