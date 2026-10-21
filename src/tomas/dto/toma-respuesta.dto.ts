import { ApiProperty } from '@nestjs/swagger';
export class TomaRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() medicamento_id: string;
  @ApiProperty({ type: String, nullable: true }) horario_id: string | null;
  @ApiProperty() adulto_id: string;
  @ApiProperty({ type: String, format: 'date-time' }) programada_para: Date;
  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'Hora del recordatorio; no cambia la ventana original de la toma.',
  })
  recordar_en: Date;
  @ApiProperty({
    enum: ['PENDIENTE', 'POSPUESTA', 'TOMADA', 'OMITIDA', 'CANCELADA'],
  })
  estado: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  tomada_en: Date | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Decimal serializado por Prisma.',
  })
  dosis_tomada: string | null;
  @ApiProperty({ type: String, nullable: true }) registrada_por: string | null;
  @ApiProperty({ type: String, nullable: true }) nota: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) created_at: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updated_at: Date;
}
