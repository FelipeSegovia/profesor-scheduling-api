import { Module } from '@nestjs/common';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';
import { OutboxService } from './outbox.service.js';

/**
 * Bandeja de salida de correos (spec 006). Antes `OutboxService` se proveía
 * por separado en `BookingsModule` y `PanelModule`; ahora ambos importan este
 * módulo, que también tiene el despachador.
 */
@Module({
  providers: [OutboxService, OutboxDispatcherService],
  exports: [OutboxService, OutboxDispatcherService],
})
export class OutboxModule {}
