import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFamiliarDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  parentesco?: string;

  /**
   * Marca al familiar como contacto principal del adulto. La BD garantiza
   * que solo exista uno activo por adulto (índice único parcial).
   */
  @IsOptional()
  @IsBoolean()
  es_contacto_principal?: boolean;

  @IsOptional()
  @IsBoolean()
  puede_ver_ubicacion?: boolean;

  @IsOptional()
  @IsBoolean()
  puede_gestionar_medicamentos?: boolean;

  /**
   * PENDIENTE: activar/confirmar pendiente.
   * ACTIVA: reactivar relación REVOCADA.
   * REVOCADA: desactivar relación (la activación posterior solo por admin).
   */
  @IsOptional()
  @IsIn(['PENDIENTE', 'ACTIVA', 'REVOCADA'])
  estado?: string;
}
