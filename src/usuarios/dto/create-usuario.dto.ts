import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @IsInt()
  rol_id!: number;

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
  @MaxLength(255)
  password_hash!: string;

  @IsOptional()
  @IsString()
  email_verificado_en?: string;

  @IsOptional()
  activo?: boolean;
}