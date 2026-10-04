import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const TIPOS_ALERTA = [
  'SOS',
  'CAIDA',
  'ZONA_SEGURA',
  'MEDICAMENTO',
  'INACTIVIDAD',
  'SISTEMA',
  'OTRA',
] as const;

export const SEVERIDADES_ALERTA = [
  'BAJA',
  'MEDIA',
  'ALTA',
  'CRITICA',
] as const;

export class CreateAlertaDto {
  @IsOptional()
  @IsUUID()
  adulto_id?: string;

  @IsOptional()
  @IsUUID()
  dispositivo_id?: string;

  @IsEnum(TIPOS_ALERTA)
  tipo!: (typeof TIPOS_ALERTA)[number];

  @IsOptional()
  @IsEnum(SEVERIDADES_ALERTA)
  severidad?: (typeof SEVERIDADES_ALERTA)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud?: number;
}
