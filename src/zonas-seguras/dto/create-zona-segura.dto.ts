import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateZonaSeguraDto {
  @IsUUID()
  adulto_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre!: string;

  /** Latitud del centro: -90 a 90. */
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud_centro!: number;

  /** Longitud del centro: -180 a 180. */
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud_centro!: number;

  /**
   * Radio de la zona en metros (50 m a 10 km). Rango razonable para
   * detectar salidas/entradas con GPS doméstico.
   */
  @IsInt()
  @Min(50)
  @Max(10000)
  radio_metros!: number;

  @IsOptional()
  @IsBoolean()
  notificar_salida?: boolean;

  @IsOptional()
  @IsBoolean()
  notificar_entrada?: boolean;
}
