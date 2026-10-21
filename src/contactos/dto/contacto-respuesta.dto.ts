import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Fila de contactos_emergencia (SELECT_CONTACTO del service). */
export class ContactoRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() adulto_id: string;
  @ApiProperty() nombre: string;
  @ApiPropertyOptional({ nullable: true }) parentesco: string | null;
  @ApiProperty() telefono: string;
  @ApiPropertyOptional({ nullable: true }) email: string | null;
  @ApiProperty() prioridad: number;
  @ApiProperty() activo: boolean;
  @ApiProperty({ format: 'date-time' }) created_at: string;
}
