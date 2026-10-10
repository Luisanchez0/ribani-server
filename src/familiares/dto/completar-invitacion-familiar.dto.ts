import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CompletarInvitacionFamiliarDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  /** Datos que completan la cuenta del adulto creado como invitación. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;
}
