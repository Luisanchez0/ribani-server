import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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
}