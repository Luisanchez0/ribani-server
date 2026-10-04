import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Fecha y hora completa con zona: 2026-10-03T08:00:00-06:00 | ...Z */
const FECHA_HORA_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export class CreateUbicacionDto {
  /** Dispositivo desde el que se reporta (debe ser del usuario autenticado). */
  @IsOptional()
  @IsUUID()
  dispositivo_id?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  precision_metros?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1000)
  @Max(10000)
  altitud_metros?: number;

  @IsOptional()
  @IsEnum(['GPS', 'RED', 'MANUAL'])
  fuente?: 'GPS' | 'RED' | 'MANUAL';

  @IsOptional()
  @IsString()
  @Matches(FECHA_HORA_REGEX, {
    message:
      'registrada_en debe ser fecha y hora ISO 8601 completa con zona (ej: "2026-10-03T08:00:00-06:00").',
  })
  registrada_en?: string;
}
