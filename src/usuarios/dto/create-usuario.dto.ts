import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  rol_codigo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nombre!: string;

  @IsString()
  @MinLength(1)
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

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}