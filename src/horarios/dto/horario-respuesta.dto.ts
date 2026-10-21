import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Fila de horarios_medicamento (SELECT_HORARIO del service). */
export class HorarioRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() medicamento_id: string;
  @ApiProperty({ description: 'Hora local del día, HH:mm:ss.' }) hora_local:
    | string
    | Date;
  @ApiProperty({
    type: [Number],
    description: 'Días de la semana ISO (1=lunes … 7=domingo).',
  })
  dias_semana: number[];
  @ApiProperty({
    description: 'Minutos entre tomas dentro del horario (0 = único evento).',
  })
  intervalo_minutos: number;
  @ApiProperty({
    description: 'Ventana en minutos alrededor de la hora para registrar.',
  })
  ventana_minutos: number;
  @ApiProperty() activo: boolean;
  @ApiProperty({ format: 'date-time' }) created_at: string;
}
