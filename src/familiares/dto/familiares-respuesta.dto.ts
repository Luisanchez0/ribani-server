import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class UsuarioResumenDto {
  @ApiProperty() id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() apellido: string;
  @ApiProperty() email: string;
  @ApiPropertyOptional({ nullable: true }) telefono: string | null;
  @ApiPropertyOptional() activo: boolean;
}

/** Fila de adulto_familiares con usuarios anidados (SELECT_RELACION). */
export class VinculoFamiliarRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() adulto_id: string;
  @ApiProperty() familiar_id: string;
  @ApiPropertyOptional({ nullable: true }) parentesco: string | null;
  @ApiProperty() es_contacto_principal: boolean;
  @ApiProperty() puede_ver_ubicacion: boolean;
  @ApiProperty() puede_gestionar_medicamentos: boolean;
  @ApiProperty({
    enum: ['PENDIENTE', 'ACTIVA', 'REVOCADA'],
  })
  estado: string;
  @ApiProperty({ format: 'date-time' }) created_at: string;
  @ApiPropertyOptional({ nullable: true, type: UsuarioResumenDto })
  usuarios_adulto_familiares_adulto_idTousuarios?: UsuarioResumenDto | null;
  @ApiPropertyOptional({ nullable: true, type: UsuarioResumenDto })
  usuarios_adulto_familiares_familiar_idTousuarios?: UsuarioResumenDto | null;
}

/** Adulto accesible para el familiar/admin (GET /familiares/mis-adultos). */
export class AdultoVinculadoRespuestaDto {
  @ApiProperty() id: string;
  /** id del vínculo; vacío para ADMIN (acceso total). */
  @ApiProperty() vinculo_id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() apellido: string;
  @ApiProperty() email: string;
  @ApiPropertyOptional({ nullable: true }) parentesco: string | null;
  @ApiProperty() es_contacto_principal: boolean;
  @ApiProperty() puede_ver_ubicacion: boolean;
  @ApiProperty() puede_gestionar_medicamentos: boolean;
  @ApiProperty() estado: string;
}

/** Anidado devuelto por POST /familiares/invitaciones (invitarPorEmail). */
export class InvitacionAdultoDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) nombre?: string;
  @ApiPropertyOptional({ nullable: true }) apellido?: string | null;
  @ApiProperty() email: string;
  @ApiPropertyOptional() esNuevaCuenta?: boolean;
}

export class InvitacionFamiliarRespuestaDto extends VinculoFamiliarRespuestaDto {
  @ApiProperty({ type: InvitacionAdultoDto }) adulto: InvitacionAdultoDto;
  @ApiProperty() esNuevaCuenta: boolean;
  @ApiProperty() mensaje: string;
}

/** Respuesta al completar el registro el adulto invitado (público). */
export class CompletarInvitacionRespuestaDto {
  @ApiProperty() adulto_id: string;
  @ApiProperty() email: string;
  @ApiProperty() mensaje: string;
}
