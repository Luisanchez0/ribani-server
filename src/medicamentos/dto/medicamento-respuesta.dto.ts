import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Fila de medicamentos (SELECT_MEDICAMENTO del service). */
export class MedicamentoRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() adulto_id: string;
  @ApiProperty() nombre: string;
  @ApiPropertyOptional({ nullable: true }) descripcion: string | null;
  @ApiProperty() dosis: number;
  @ApiProperty() unidad_dosis: string;
  @ApiPropertyOptional({ nullable: true }) instrucciones: string | null;
  @ApiProperty({ format: 'date' }) fecha_inicio: string;
  @ApiPropertyOptional({ nullable: true, format: 'date' }) fecha_fin:
    | string
    | null;
  @ApiProperty() zona_horaria: string;
  @ApiProperty() activo: boolean;
  @ApiPropertyOptional({ nullable: true }) creado_por: string | null;
  @ApiProperty({ format: 'date-time' }) created_at: string;
  @ApiProperty({ format: 'date-time' }) updated_at: string;
}
