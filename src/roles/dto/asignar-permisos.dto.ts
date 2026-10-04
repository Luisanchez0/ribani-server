import { IsArray, IsString, MaxLength } from 'class-validator';

export class AsignarPermisosDto {
  /**
   * Códigos de permisos que tendrá el rol (reemplaza la lista completa).
   * Array vacío = revocar todos los permisos del rol.
   */
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permisos!: string[];
}
