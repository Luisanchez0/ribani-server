import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ActorAuditoriaDto {
  @ApiProperty() nombre: string;
  @ApiProperty() apellido: string;
  @ApiProperty() email: string;
}

/** Evento de auditoría (id BigInt serializado a string). */
export class EventoAuditoriaRespuestaDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ nullable: true }) actor_id: string | null;
  @ApiProperty() accion: string;
  @ApiProperty() entidad: string;
  @ApiPropertyOptional({ nullable: true }) entidad_id: string | null;
  @ApiPropertyOptional({ nullable: true }) ip: string | null;
  @ApiPropertyOptional({ nullable: true }) user_agent: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Cambios aplicados (JSON).',
  })
  datos_despues: object | null;
  @ApiProperty({ format: 'date-time' }) created_at: string;
  @ApiPropertyOptional({ nullable: true, type: ActorAuditoriaDto })
  actor: ActorAuditoriaDto | null;
}
