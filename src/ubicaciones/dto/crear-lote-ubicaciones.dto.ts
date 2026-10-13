import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';

import { CreateUbicacionDto } from './create-ubicacion.dto.js';


export class CrearLoteUbicacionesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => CreateUbicacionDto)
  @ValidateNested({ each: true })
  reportes!: CreateUbicacionDto[];
}
