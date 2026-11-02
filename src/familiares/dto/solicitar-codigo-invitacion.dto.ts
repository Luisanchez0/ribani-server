import { IsEmail, MaxLength } from 'class-validator';

export class SolicitarCodigoInvitacionDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
