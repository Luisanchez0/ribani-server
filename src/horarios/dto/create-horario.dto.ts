import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateHorarioDto {
  /**
   * Hora local en formato 24h: "HH:MM" o "HH:MM:SS".
   * Se interpreta en la zona_horaria del medicamento.
   */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
    message: 'hora_local debe tener formato 24h: HH:MM o HH:MM:SS (ejemplo: "08:30").',
  })
  @MaxLength(8)
  hora_local!: string;

  /**
   * Días de la semana en formato ISO: 1 = lunes ... 7 = domingo.
   * Si no se envía, la BD usa el default (todos los días).
   */
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
}
