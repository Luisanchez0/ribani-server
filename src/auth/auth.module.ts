import 'dotenv/config';

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { MailModule } from '../mail/mail.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';
import { AuthAttemptsService } from './auth-attempts.service.js';
import { WebAuthController } from './web-auth.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './gurads/jwt-auth.guard.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

const accessSecret = process.env.JWT_ACCESS_SECRET;

if (!accessSecret || Buffer.byteLength(accessSecret) < 32) {
  throw new Error(
    'JWT_ACCESS_SECRET debe contener al menos 32 bytes aleatorios.',
  );
}
const accessSeconds = Number(process.env.JWT_ACCESS_EXPIRES_IN_SECONDS ?? 900);
const refreshSeconds = Number(
  process.env.JWT_REFRESH_EXPIRES_IN_SECONDS ?? 604800,
);
if (
  !Number.isInteger(accessSeconds) ||
  accessSeconds < 60 ||
  accessSeconds > 1800
) {
  throw new Error(
    'JWT_ACCESS_EXPIRES_IN_SECONDS debe ser un entero entre 60 y 1800.',
  );
}
if (
  !Number.isInteger(refreshSeconds) ||
  refreshSeconds < 900 ||
  refreshSeconds > 2592000
) {
  throw new Error(
    'JWT_REFRESH_EXPIRES_IN_SECONDS debe ser un entero entre 900 y 2592000.',
  );
}

@Module({
  imports: [
    PrismaModule,
    MailModule,

    PassportModule,

    JwtModule.register({
      secret: accessSecret,
      signOptions: {
        algorithm: 'HS256',
        expiresIn: accessSeconds,
      },
    }),
  ],

  controllers: [AuthController, WebAuthController],

  providers: [
    AuthService,
    AuthAttemptsService,
    AuthRateLimitGuard,
    JwtStrategy,
    JwtAuthGuard,
  ],

  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
