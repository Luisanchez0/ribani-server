import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Fila de ubicaciones (SELECT_UBICACION del service; id BigInt → string). */
export class UbicacionRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() adulto_id: string;
  @ApiPropertyOptional({ nullable: true }) dispositivo_id: string | null;
  @ApiProperty() latitud: number;
  @ApiProperty() longitud: number;
  @ApiPropertyOptional({ nullable: true }) precision_metros: number | null;
  @ApiPropertyOptional({ nullable: true }) altitud_metros: number | null;
  @ApiProperty({ enum: ['GPS', 'RED', 'MANUAL', 'OTRA'] }) fuente: string;
  @ApiProperty({ format: 'date-time' }) registrada_en: string;
}

/** Respuesta de POST /ubicaciones/lote. */
export class LoteUbicacionesRespuestaDto {
  @ApiProperty({ description: 'Reportes insertados en la base.' })
  insertados: number;
  @ApiProperty({ type: UbicacionRespuestaDto })
  ultima_reporte: UbicacionRespuestaDto;
}
