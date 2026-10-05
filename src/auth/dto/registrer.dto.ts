import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Roles asignables desde el registro público. ADMINISTRADOR no está
 * incluido a propósito: no debe poder crearse un admin desde la web.
 */
const ROLES_REGISTRO = ['ADULTO_MAYOR', 'FAMILIAR_ENCARGADO'] as const;

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellido!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  /**
   * Rol del nuevo usuario. Opcional: si no se envía se usa ADULTO_MAYOR,
   * manteniendo compatibilidad con el flujo actual de la app.
   */
  @IsOptional()
  @IsIn(ROLES_REGISTRO)
  rolCodigo?: (typeof ROLES_REGISTRO)[number];
}