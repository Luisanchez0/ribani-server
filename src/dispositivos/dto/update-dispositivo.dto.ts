import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateDispositivoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  push_token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  version_app?: string;
}
