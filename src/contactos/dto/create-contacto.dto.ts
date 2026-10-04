import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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

  @IsString()
  @MinLength(7)
  @MaxLength(20)
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
