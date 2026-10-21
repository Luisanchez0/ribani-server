import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Fila de alertas (SELECT_ALERTA del service). */
export class AlertaRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() adulto_id: string;
  @ApiPropertyOptional({ nullable: true }) dispositivo_id: string | null;
  @ApiProperty({
    enum: ['CAIDA', 'SOS', 'SALIDA_ZONA'],
  })
  tipo: string;
  @ApiProperty({
    enum: ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'],
  })
  severidad: string;
  @ApiProperty({
    enum: ['ABIERTA', 'EN_ATENCION', 'RESUELTA', 'CANCELADA'],
  })
  estado: string;
  @ApiProperty() titulo: string;
  @ApiPropertyOptional({ nullable: true }) descripcion: string | null;
  @ApiPropertyOptional({ nullable: true }) latitud: number | null;
  @ApiPropertyOptional({ nullable: true }) longitud: number | null;
  @ApiProperty({ format: 'date-time' }) ocurrida_en: string;
  @ApiPropertyOptional({ nullable: true }) atendida_por: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  atendida_en: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  cerrada_en: string | null;
  @ApiProperty({ format: 'date-time' }) created_at: string;
}

export class IntervaloUbicacionRespuestaDto {
  @ApiProperty({ description: 'Segundos recomendados entre reportes.' })
  intervalo_segundos: number;
}
