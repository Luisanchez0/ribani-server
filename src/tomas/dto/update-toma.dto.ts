import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { FECHA_HORA_REGEX } from './create-toma.dto.js';

export class UpdateTomaDto {
  /**
   * TOMADA: registra la toma (valida la ventana del horario).
   * OMITIDA: marca la toma como no realizada (sin validación de ventana).
   * Las tomas solo pueden transicionar desde PENDIENTE.
   */
  @IsOptional()
  @IsIn(['TOMADA', 'OMITIDA'])
  estado?: 'TOMADA' | 'OMITIDA';

  /**
   * Momento real de la toma (ISO 8601). Si no se envía se usa "ahora".
   * Solo se admite cuando estado = TOMADA y se valida contra la ventana.
   */
  @IsOptional()
  @Matches(FECHA_HORA_REGEX, {
    message:
      'tomada_en debe ser fecha y hora ISO 8601 completa con zona (ej: "2026-10-03T08:20:00-06:00").',
  })
  tomada_en?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(9999999.999)
  dosis_tomada?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
