import { Module, type DynamicModule } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { SlotsModule } from './slots/slots.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PanelModule } from './panel/panel.module.js';
import { EventsModule } from './events/events.module.js';
import { EmailModule } from './email/email.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

// Importar `./config/config.module.js` arriba ya corrió `NestConfigModule.forRoot()`
// (dotenv incluido), así que `process.env` refleja `.env` acá abajo. Sin
// credenciales reales no tiene sentido montarlo: con las credenciales de
// ejemplo del scaffold original, el agente de Observe queda reintentando y
// logueando un 401 cada minuto.
const observeCredentials =
  process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET
    ? { appKey: process.env.OBSERVE_APP_KEY, appSecret: process.env.OBSERVE_APP_SECRET }
    : null;

const observeImports: DynamicModule[] = observeCredentials
  ? [
      ObserveModule.forRoot({
        ...observeCredentials,
        serviceId: 'profesor-scheduling-api',
      }),
    ]
  : [];

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    EventsModule,
    EmailModule,
    // Intervalo del despachador del outbox (spec 006).
    ScheduleModule.forRoot(),
    HealthModule,
    SlotsModule,
    AuthModule,
    BookingsModule,
    PanelModule,
    ...observeImports,
  ],
})
export class AppModule {}
