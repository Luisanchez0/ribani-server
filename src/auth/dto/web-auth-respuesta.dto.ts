import { OmitType } from '@nestjs/swagger';
import { TokensRespuestaDto } from './auth-respuesta.dto.js';

/** El refresh del navegador se entrega exclusivamente mediante cookie HttpOnly. */
export class TokensWebRespuestaDto extends OmitType(TokensRespuestaDto, [
  'refreshToken',
] as const) {}
