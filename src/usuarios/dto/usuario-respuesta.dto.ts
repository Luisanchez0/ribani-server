import { ApiProperty } from '@nestjs/swagger';

/** Proyección pública utilizada por usuarios y perfil; excluye hashes y 2FA. */
export class UsuarioRespuestaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() rol_id!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty() apellido!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ type: String, nullable: true }) telefono!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) email_verificado_en!: string | null;
  @ApiProperty() activo!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) ultimo_acceso_en!: string | null;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

export class PasswordActualizadaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: [true] }) password_actualizada!: boolean;
}
