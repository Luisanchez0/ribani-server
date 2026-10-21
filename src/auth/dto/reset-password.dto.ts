import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SolicitarResetPasswordDto {
  @ApiProperty({ example: 'ana@ejemplo.mx' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'ana@ejemplo.mx' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Código de 6 dígitos enviado por correo.' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  codigo!: string;

  @ApiProperty({ minLength: 8, maxLength: 64 })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;
}
