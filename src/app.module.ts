import { Module, type DynamicModule } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { SlotsModule } from './slots/slots.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { AuthModule } from './auth/auth.module.js';

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
    HealthModule,
    SlotsModule,
    AuthModule,
    BookingsModule,
    ...observeImports,
  ],
})
export class AppModule {}
