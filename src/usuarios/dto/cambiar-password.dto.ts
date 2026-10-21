import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * PATCH /usuarios/perfil/password — cambio de CONTRASEÑA PROPIA del
 * usuario autenticado. Exige la contraseña actual para re-hashear la
 * nueva (mismo criterio bcrypt que create/update de UsuariosService).
 */
export class CambiarPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password_actual!: string;

  @ApiProperty({ minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
