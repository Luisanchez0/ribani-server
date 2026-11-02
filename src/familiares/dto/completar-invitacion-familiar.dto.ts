import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CompletarInvitacionFamiliarDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    description:
      'Código de 6 dígitos enviado al correo con POST /familiares/invitaciones/solicitar-codigo.',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'codigo debe tener 6 dígitos.' })
  codigo!: string;

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
