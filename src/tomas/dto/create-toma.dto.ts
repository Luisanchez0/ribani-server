import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** Fecha y hora completa con zona: 2026-10-03T08:00:00-06:00 | ...Z | ...+00:00 */
export const FECHA_HORA_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export class CreateTomaDto {
  @IsUUID()
  medicamento_id!: string;


  @IsOptional()
  @IsUUID()
  horario_id?: string;


  @Matches(FECHA_HORA_REGEX, {
    message:
      'programada_para debe ser fecha y hora ISO 8601 completa con zona (ej: "2026-10-03T08:00:00-06:00").',
  })
  programada_para!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
