import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateContactoDto {
  @IsUUID()
  adulto_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parentesco?: string;

  /**
   * Misma regla que el CHECK contacto_telefono_chk en PostgreSQL
   * (E.164: + seguido de 8 a 15 dígitos) para que el cliente reciba
   * un 400 claro y no un error 500 de la BD.
   */
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  @Matches(/^\+[1-9][0-9]{7,14}$/, {
    message:
      'El teléfono debe estar en formato internacional, ej. +5215512345678.',
  })
  telefono!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  prioridad?: number;
}
