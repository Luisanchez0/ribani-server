import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateMedicamentoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(9999999.999)
  dosis?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unidad_dosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instrucciones?: string;

  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_fin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  zona_horaria?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
