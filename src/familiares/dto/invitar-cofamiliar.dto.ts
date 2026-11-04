import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * POST /familiares/invitaciones/familiar — un FAMILIAR_ENCARGADO con vínculo
 * ACTIVA invita a otro familiar (con cuenta propia) a acompañar al mismo
 * adulto mayor. El vínculo nace PENDIENTE y lo acepta el adulto mayor.
 */
export class InvitarCofamiliarDto {
  /** Adulto mayor que se compartirá; el caller debe tener vínculo ACTIVA. */
  @IsUUID()
  adulto_id!: string;

  /** Correo de la cuenta FAMILIAR_ENCARGADO invitada (trim + lowercase). */
  @IsEmail()
  @MaxLength(254)
  familiar_email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parentesco?: string;

  /** No puede superar el permiso de quien invita. */
  @IsOptional()
  @IsBoolean()
  puede_ver_ubicacion?: boolean;

  /** No puede superar el permiso de quien invita. */
  @IsOptional()
  @IsBoolean()
  puede_gestionar_medicamentos?: boolean;
}
