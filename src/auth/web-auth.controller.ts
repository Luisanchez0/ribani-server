import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';
import {
  DesafioDosPasosDto,
  MensajeRespuestaDto,
  TokensRespuestaDto,
} from './dto/auth-respuesta.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { TwoFactorLoginDto } from './dto/two-factor-login.dto.js';
import { TokensWebRespuestaDto } from './dto/web-auth-respuesta.dto.js';

const REFRESH_COOKIE = 'ribani_refresh';

@ApiTags('auth-web')
@ApiExtraModels(TokensWebRespuestaDto, DesafioDosPasosDto)
@UseGuards(AuthRateLimitGuard)
@Controller('auth/web')
export class WebAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiCreatedResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(TokensWebRespuestaDto) },
        { $ref: getSchemaPath(DesafioDosPasosDto) },
      ],
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertOrigin(request);
    const result = await this.authService.login(dto, this.metadata(request));
    response.setHeader('Cache-Control', 'no-store');
    if ('twoFactorRequired' in result) return result;
    return this.browserTokens(result, response);
  }

  @Post('2fa/login')
  @ApiCreatedResponse({ type: TokensWebRespuestaDto })
  async loginWithTwoFactor(
    @Body() dto: TwoFactorLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertOrigin(request);
    return this.browserTokens(
      await this.authService.loginWithTwoFactor(dto, this.metadata(request)),
      response,
    );
  }

  @Post('refresh')
  @ApiCreatedResponse({ type: TokensWebRespuestaDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertOrigin(request);
    const refreshToken = this.refreshCookie(request);
    return this.browserTokens(
      await this.authService.refresh({ refreshToken }, this.metadata(request)),
      response,
    );
  }

  @Post('logout')
  @ApiCreatedResponse({ type: MensajeRespuestaDto })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertOrigin(request);
    // Borrar incluso una cookie ya vencida o revocada para poder salir siempre.
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    const refreshToken = this.refreshCookie(request, false);
    return refreshToken
      ? this.authService.logout({ refreshToken }, this.metadata(request))
      : { message: 'Sesión cerrada correctamente.' };
  }

  private browserTokens(
    tokens: TokensRespuestaDto,
    response: Response,
  ): TokensWebRespuestaDto {
    response.setHeader('Cache-Control', 'no-store');
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOptions(),
      maxAge:
        Number(process.env.JWT_REFRESH_EXPIRES_IN_SECONDS ?? 604800) * 1000,
    });
    return {
      accessToken: tokens.accessToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    };
  }

  private cookieOptions(): CookieOptions {
    const production = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: production,
      sameSite: production ? 'none' : 'lax',
      path: '/auth/web',
    };
  }

  private assertOrigin(request: Request): void {
    const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const origin = request.headers.origin;
    // CORS por sí solo no evita que sitios externos envíen solicitudes con cookies.
    if (!origin || origin === 'null' || !allowed.includes(origin)) {
      throw new ForbiddenException('Origen de la solicitud no permitido.');
    }
  }

  private refreshCookie(request: Request, required = true): string {
    const matches = (request.headers.cookie ?? '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`));
    let token = '';
    if (matches.length === 1) {
      try {
        token = decodeURIComponent(
          matches[0]!.slice(REFRESH_COOKIE.length + 1),
        );
      } catch {
        /* Cookie inválida. */
      }
    }
    if (
      !token ||
      token.length > 2048 ||
      /\s/.test(token) ||
      Array.from(token).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      )
    ) {
      if (required)
        throw new UnauthorizedException('Sesión del navegador no válida.');
      return '';
    }
    return token;
  }

  private metadata(request: Request) {
    return { ip: request.ip, userAgent: request.headers['user-agent'] };
  }
}
