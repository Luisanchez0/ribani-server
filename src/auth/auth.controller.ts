import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AuthService } from './auth.service.js';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/registrer.dto.js';
import { TwoFactorLoginDto } from './dto/two-factor-login.dto.js';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto.js';
import { JwtAuthGuard } from './gurads/jwt-auth.guard.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('auth')
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

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  setupTwoFactor(@Req() request: AuthenticatedRequest) {
    return this.authService.setupTwoFactor(
      request.user.id,
    );
  }

  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  verifyTwoFactor(
    @Req() request: AuthenticatedRequest,
    @Body() dto: VerifyTwoFactorDto,
  ) {
    return this.authService.verifyTwoFactor(
      request.user.id,
      dto,
    );
  }

  @Post('2fa/login')
  loginWithTwoFactor(
    @Body() dto: TwoFactorLoginDto,
    @Req() request: Request,
  ) {
    return this.authService.loginWithTwoFactor(dto, {
      ip: this.getIp(request),
      userAgent: request.headers['user-agent'],
    });
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  disableTwoFactor(
    @Req() request: AuthenticatedRequest,
    @Body() dto: DisableTwoFactorDto,
  ) {
    return this.authService.disableTwoFactor(
      request.user.id,
      dto,
    );
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