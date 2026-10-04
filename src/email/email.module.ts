import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../config/env.js';
import { ConsoleEmailSender } from './console-email.sender.js';
import { EMAIL_SENDER, type EmailSender } from './email-sender.js';
import { ResendEmailSender } from './resend-email.sender.js';

/**
 * Elige el transporte según la configuración (spec 006): Resend si hay
 * `RESEND_API_KEY`, consola si no. `validateEnv` ya garantiza que con key hay
 * `EMAIL_FROM`, y que en producción hay key y no hay redirect.
 *
 * Global porque lo inyectan módulos que no se conocen entre sí (el outbox y
 * la cuenta del apoderado), igual que `EventsModule`.
 */
@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailSender => {
        const logger = new Logger('EmailModule');
        const apiKey = config.get('RESEND_API_KEY', { infer: true });
        if (!apiKey) {
          logger.log('Sin RESEND_API_KEY: los correos se escriben en el log.');
          return new ConsoleEmailSender();
        }
        const redirectTo = config.get('EMAIL_REDIRECT_TO', { infer: true });
        if (redirectTo) {
          logger.warn(
            `EMAIL_REDIRECT_TO activo: todos los correos van a ${redirectTo}.`,
          );
        }
        return new ResendEmailSender(new Resend(apiKey).emails, {
          from: config.get('EMAIL_FROM', { infer: true })!,
          replyTo: config.get('EMAIL_REPLY_TO', { infer: true }),
          redirectTo,
        });
      },
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
