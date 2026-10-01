import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { SessionEvent } from './session-events.types.js';

/**
 * Bus en memoria de cambios de sesión. Quien confirma un cambio (reserva
 * pública, panel) llama a `emit` **después del commit**; el stream SSE del
 * panel (`GET /api/panel/events`) lo consume. Sin persistencia: un evento que
 * nadie escucha se pierde, y por eso el panel recarga sus consultas al
 * reconectarse. Funciona solo con un proceso de la API; con varias instancias
 * habría que pasar a Postgres `LISTEN/NOTIFY`. Ver
 * `.specs/005-avisos-tiempo-real/spec.md`.
 */
@Injectable()
export class SessionEventsService implements OnModuleDestroy {
  private readonly subject = new Subject<SessionEvent>();

  emit(event: SessionEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<SessionEvent> {
    return this.subject.asObservable();
  }

  /** Cierra los streams abiertos al apagar la app (`enableShutdownHooks`). */
  onModuleDestroy(): void {
    this.subject.complete();
  }
}
