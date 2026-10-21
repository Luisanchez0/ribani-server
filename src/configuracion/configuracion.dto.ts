import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export class ActualizarConfiguracionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificaciones_habilitadas?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  recordatorio_medicamentos?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  minutos_repeticion?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  max_repeticiones?: number;
  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  zona_horaria?: string;
}
export class ConfiguracionRespuestaDto {
  @ApiProperty() adulto_id: string;
  @ApiProperty() zona_horaria: string;
  @ApiProperty() notificaciones_habilitadas: boolean;
  @ApiProperty() recordatorio_medicamentos: boolean;
  @ApiProperty() minutos_repeticion: number;
  @ApiProperty() max_repeticiones: number;
  @ApiProperty() ubicacion_compartida: boolean;
  @ApiProperty({
    description:
      'Familiares con cuenta activa y vínculo ACTIVA; no indica disponibilidad de sensores.',
  })
  familiares_activos: number;
}
