import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateHorarioDto {
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
    message: 'hora_local debe tener formato 24h: HH:MM o HH:MM:SS (ejemplo: "08:30").',
  })
  @MaxLength(8)
  hora_local?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  dias_semana?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(32767)
  intervalo_minutos?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  ventana_minutos?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
