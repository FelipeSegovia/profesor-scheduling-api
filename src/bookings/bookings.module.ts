import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GuardianContextMiddleware } from '../auth/guardian-context.middleware.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { SessionsController } from './sessions.controller.js';

@Module({
  imports: [AuthModule, OutboxModule],
  controllers: [BookingsController, SessionsController],
  providers: [BookingsService],
})
export class BookingsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Solo `POST /bookings` lee un Bearer opcional; `sessions` no lo necesita,
    // pero aplicar el middleware ahí es inofensivo (nunca lanza).
    consumer.apply(GuardianContextMiddleware).forRoutes(BookingsController);
  }
}
