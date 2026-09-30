import 'dotenv/config';

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './gurads/jwt-auth.guard.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

const accessSecret = process.env.JWT_ACCESS_SECRET;

if (!accessSecret) {
  throw new Error(
    'JWT_ACCESS_SECRET is required.',
  );
}

@Module({
  imports: [
    PrismaModule,

    PassportModule,

    JwtModule.register({
      secret: accessSecret,
      signOptions: {
        expiresIn: Number(
          process.env.JWT_ACCESS_EXPIRES_IN_SECONDS ?? 900,
        ),
      },
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
  ],

  exports: [
    AuthService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}