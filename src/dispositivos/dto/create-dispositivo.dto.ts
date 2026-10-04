import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Plataformas: igual al CHECK de BD dispositivos_plataforma_chk. */
export const PLATAFORMAS = ['ANDROID', 'IOS', 'WEB'] as const;

export class CreateDispositivoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre!: string;

  @IsEnum(PLATAFORMAS)
  plataforma!: (typeof PLATAFORMAS)[number];


  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  identificador?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  push_token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  version_app?: string;
}
