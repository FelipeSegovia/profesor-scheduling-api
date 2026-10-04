import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import { SlotsModule } from '../slots/slots.module.js';
import { EducatorAuthGuard } from './auth/educator-auth.guard.js';
import { EducatorContextMiddleware } from './auth/educator-context.middleware.js';
import { EducatorTokenService } from './auth/educator-token.service.js';
import { PanelAuthController } from './auth/panel-auth.controller.js';
import { PanelAuthService } from './auth/panel-auth.service.js';
import { PanelAgendaController } from './agenda/panel-agenda.controller.js';
import { PanelAgendaService } from './agenda/panel-agenda.service.js';
import { PanelNotificationsController } from './notifications/panel-notifications.controller.js';
import { PanelNotificationsService } from './notifications/panel-notifications.service.js';
import { PanelEventsController } from './events/panel-events.controller.js';
import { PanelDashboardController } from './dashboard/panel-dashboard.controller.js';
import { PanelDashboardService } from './dashboard/panel-dashboard.service.js';
import { PanelScheduleController } from './schedule/panel-schedule.controller.js';
import { PanelScheduleService } from './schedule/panel-schedule.service.js';
import { PanelSessionsController } from './sessions/panel-sessions.controller.js';
import { PanelSessionsService } from './sessions/panel-sessions.service.js';
import { PanelClinicalNotesController } from './clinical-notes/panel-clinical-notes.controller.js';
import { PanelClinicalNotesService } from './clinical-notes/panel-clinical-notes.service.js';
import { PanelPeopleController } from './people/panel-people.controller.js';
import { PanelPeopleService } from './people/panel-people.service.js';
import { OutboxModule } from '../outbox/outbox.module.js';

/**
 * Panel de la educadora (`/api/panel/*`). Módulo independiente de `AuthModule`
 * (apoderado): otro `JwtModule` (secreto propio, `EDUCATOR_JWT_SECRET`), otro
 * middleware de contexto, otro guard. Ver
 * `.specs/004-panel-educadora/plan.md`, sección "Autenticación de la educadora".
 */
const PANEL_CONTROLLERS = [
  PanelAuthController,
  PanelAgendaController,
  PanelDashboardController,
  PanelScheduleController,
  PanelSessionsController,
  PanelPeopleController,
  PanelClinicalNotesController,
  PanelEventsController,
  PanelNotificationsController,
];

@Module({
  imports: [
    SlotsModule,
    OutboxModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('EDUCATOR_JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('EDUCATOR_JWT_EXPIRES_IN', { infer: true }) },
      }),
    }),
  ],
  controllers: PANEL_CONTROLLERS,
  providers: [
    PanelAuthService,
    EducatorTokenService,
    EducatorContextMiddleware,
    EducatorAuthGuard,
    PanelAgendaService,
    PanelDashboardService,
    PanelScheduleService,
    PanelSessionsService,
    PanelPeopleService,
    PanelClinicalNotesService,
    PanelNotificationsService,
  ],
})
export class PanelModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Todas las rutas de `/api/panel/*` decodifican el Bearer de educadora (el
    // middleware nunca lanza); `EducatorAuthGuard` es el que exige sesión, y se
    // aplica por controlador/ruta para excluir `login` sin recurrir a `APP_GUARD`.
    consumer.apply(EducatorContextMiddleware).forRoutes(...PANEL_CONTROLLERS);
  }
}
