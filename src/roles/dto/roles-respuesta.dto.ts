import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Fila de permisos (id BigInt serializado a string). */
export class PermisoRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() codigo: string;
  @ApiProperty() recurso: string;
  @ApiProperty() accion: string;
  @ApiPropertyOptional({ nullable: true }) descripcion: string | null;
}

export class RolRespuestaDto {
  @ApiProperty() id: number;
  @ApiProperty({
    enum: ['ADULTO_MAYOR', 'FAMILIAR_ENCARGADO', 'ADMINISTRADOR'],
  })
  codigo: string;
  @ApiProperty() nombre: string;
  @ApiPropertyOptional({ nullable: true }) descripcion: string | null;
  @ApiProperty() activo: boolean;
  @ApiProperty({ type: () => [PermisoRespuestaDto] })
  permisos: PermisoRespuestaDto[];
}
