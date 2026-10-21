import { ApiProperty } from '@nestjs/swagger';

export class RolSesionDto {
  @ApiProperty() id!: number;
  @ApiProperty() codigo!: string;
  @ApiProperty() nombre!: string;
}

export class UsuarioSesionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() apellido!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ type: String, nullable: true }) telefono!: string | null;
  @ApiProperty() emailVerificado!: boolean;
  @ApiProperty() twoFactorEnabled!: boolean;
  @ApiProperty({ type: RolSesionDto }) rol!: RolSesionDto;
  @ApiProperty({ type: [String] }) permisos!: string[];
}

export class TokensRespuestaDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ enum: ['Bearer'] }) tokenType!: string;
  @ApiProperty() expiresIn!: number;
  @ApiProperty({ type: UsuarioSesionDto }) user!: UsuarioSesionDto;
}

export class DesafioDosPasosDto {
  @ApiProperty({ enum: [true] }) twoFactorRequired!: boolean;
  @ApiProperty() challengeToken!: string;
  @ApiProperty() expiresIn!: number;
}

export class ConfigDosPasosDto {
  @ApiProperty() secret!: string;
  @ApiProperty() otpauthUrl!: string;
  @ApiProperty() mensaje!: string;
}

export class EstadoDosPasosDto {
  @ApiProperty() twoFactorEnabled!: boolean;
  @ApiProperty() mensaje!: string;
}

export class UsuarioActualDto extends UsuarioSesionDto {
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) ultimoAcceso!: string | null;
}

export class RegistroRespuestaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() apellido!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ type: String, nullable: true }) telefono!: string | null;
  @ApiProperty() activo!: boolean;
  @ApiProperty({ type: RolSesionDto }) rol!: RolSesionDto;
  @ApiProperty() emailVerificado!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class MensajeRespuestaDto {
  @ApiProperty() message!: string;
}
