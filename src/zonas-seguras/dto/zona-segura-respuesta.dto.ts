import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Fila de zonas_seguras (SELECT_ZONA del service). */
export class ZonaSeguraRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() adulto_id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() latitud_centro: number;
  @ApiProperty() longitud_centro: number;
  @ApiProperty() radio_metros: number;
  @ApiProperty() notificar_salida: boolean;
  @ApiProperty() notificar_entrada: boolean;
  @ApiProperty() activa: boolean;
  @ApiProperty({ format: 'date-time' }) created_at: string;
  @ApiProperty({ format: 'date-time' }) updated_at: string;
}
