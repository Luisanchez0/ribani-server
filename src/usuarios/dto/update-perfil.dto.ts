import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * PATCH /usuarios/perfil — edición del TERCIO PROPIO (usuario autenticado).
 *
 * Solo permite actualizar datos personales del propio perfil: nombre,
 * apellido y teléfono. NO permite email, contraseña, rol ni `activo`:
 * el cambio de esos campos exige permisos de administración
 * (PATCH /usuarios/{id} con usuarios.administrar).
 */
export class UpdatePerfilDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nombre?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  apellido?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;
}
