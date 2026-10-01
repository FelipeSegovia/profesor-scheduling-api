import { Global, Module } from '@nestjs/common';
import { SessionEventsService } from './session-events.service.js';

/**
 * Global porque lo inyectan módulos que no se conocen entre sí
 * (`BookingsModule` emite, `PanelModule` escucha): así ninguno importa al otro.
 */
@Global()
@Module({
  providers: [SessionEventsService],
  exports: [SessionEventsService],
})
export class EventsModule {}
