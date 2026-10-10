import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CrearInvitacionFamiliarDto {
  /**
   * Solo obligatorio cuando el caller es ADMINISTRADOR: indica qué familiar
   * encargado queda vinculado. Si llama un FAMILIAR_ENCARGADO, su ID sale
   * del token JWT y NO debe enviarse este campo.
   */
  @IsOptional()
  @IsUUID()
  familiar_id?: string;

  /** Correo del adulto mayor a vincular. Se busca exacto (trim + lowercase). */
  @IsEmail()
  @MaxLength(254)
  adulto_email!: string;

  /** Datos opcionales para crear la cuenta del adulto si todavía no existe. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  adulto_nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  adulto_apellido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  adulto_telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parentesco?: string;

  @IsOptional()
  @IsBoolean()
  puede_ver_ubicacion?: boolean;

  @IsOptional()
  @IsBoolean()
  puede_gestionar_medicamentos?: boolean;
}
