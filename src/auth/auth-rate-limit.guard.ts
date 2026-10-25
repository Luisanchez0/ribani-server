import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthAttemptsService } from './auth-attempts.service.js';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly attempts: AuthAttemptsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    try {
      this.attempts.consume(
        `auth-ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`,
        30,
        60_000,
      );
    } catch (error) {
      response.setHeader('Retry-After', '60');
      throw error;
    }
    return true;
  }
}
