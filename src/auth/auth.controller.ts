import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/registrer.dto.js';
import { JwtAuthGuard } from './gurads/jwt-auth.guard.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ) {
    return this.authService.login(dto, {
      ip: this.getIp(request),
      userAgent: request.headers['user-agent'],
    });
  }

  @Post('refresh')
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ) {
    return this.authService.refresh(dto, {
      ip: this.getIp(request),
      userAgent: request.headers['user-agent'],
    });
  }

  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(
      request.user.id,
    );
  }

  private getIp(request: Request): string | undefined {
    const forwarded = request.headers['x-forwarded-for'];

    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]?.trim();
    }

    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }

    return request.ip;
  }
}