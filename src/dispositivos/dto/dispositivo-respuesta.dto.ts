import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Fila de dispositivos (SELECT_DISPOSITIVO del service). */
export class DispositivoRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() usuario_id: string;
  @ApiProperty() nombre: string;
  @ApiProperty({
    enum: ['ANDROID', 'WEB', 'OTRO'],
  })
  plataforma: string;
  @ApiPropertyOptional({ nullable: true }) version_app: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  ultimo_contacto_en: string | null;
  @ApiProperty() activo: boolean;
  @ApiProperty({ format: 'date-time' }) created_at: string;
  @ApiProperty({ format: 'date-time' }) updated_at: string;
}
