import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateFamiliarDto {
  @IsUUID()
  familiar_id!: string;

  @IsUUID()
  adulto_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parentesco?: string;

  @IsOptional()
  @IsBoolean()
  puede_ver_ubicacion?: boolean;


  @IsOptional()
  @IsBoolean()
  puede_gestionar_medicamentos?: boolean;


  @IsOptional()
  @IsIn(['ACTIVA', 'PENDIENTE'])
  estado?: string;
}
