import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateZonaSeguraDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud_centro?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud_centro?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(10000)
  radio_metros?: number;

  @IsOptional()
  @IsBoolean()
  notificar_salida?: boolean;

  @IsOptional()
  @IsBoolean()
  notificar_entrada?: boolean;

  /** Solo true vía este endpoint; para desactivar usar DELETE. */
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
