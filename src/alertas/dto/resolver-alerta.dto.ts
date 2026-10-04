import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const ESTADOS_ALERTA = [
  'EN_ATENCION',
  'RESUELTA',
  'CANCELADA',
] as const;

export class ResolverAlertaDto {
  @IsEnum(ESTADOS_ALERTA)
  estado!: (typeof ESTADOS_ALERTA)[number];

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  detalle?: string;
}
