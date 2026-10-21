import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class RegistrarDestinatarioDto {
  @ApiProperty({ example: '+525512345678', pattern: '^\\+[1-9][0-9]{7,14}$' })
  @Matches(/^\+[1-9][0-9]{7,14}$/)
  telefono_e164: string;
  @ApiPropertyOptional({
    description:
      'Solo administrador; teléfono del contacto, consentimiento inicialmente pendiente.',
  })
  @IsOptional()
  @IsUUID()
  contacto_emergencia_id?: string;
}
export class ConsentimientoWhatsappDto {
  @ApiProperty({
    description:
      'Declaración expresa del titular. false revoca y cancela pendientes.',
  })
  @IsBoolean()
  aceptado: boolean;
  @ApiPropertyOptional({
    enum: ['FORMULARIO', 'OTRO'],
    description:
      'Para contactos sin cuenta, el administrador debe conservar evidencia externa del consentimiento.',
  })
  @IsOptional()
  @IsIn(['FORMULARIO', 'OTRO'])
  origen?: 'FORMULARIO' | 'OTRO';
}
export class PreferenciasWhatsappDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificaciones_habilitadas?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  recordatorio_medicamentos?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  minutos_repeticion?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  max_repeticiones?: number;
}
export class DestinatarioWhatsappDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true, type: String }) usuario_id: string | null;
  @ApiProperty({ nullable: true, type: String }) contacto_emergencia_id:
    string | null;
  @ApiProperty() telefono_e164: string;
  @ApiProperty({ nullable: true, type: String }) nombre: string | null;
  @ApiProperty({ enum: ['PENDIENTE', 'ACEPTADO', 'REVOCADO'] })
  consentimiento: string;
  @ApiProperty({ nullable: true, type: String }) consentimiento_origen:
    string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  consentimiento_en: Date | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  revocado_en: Date | null;
  @ApiProperty() activo: boolean;
}
export class EstadoWhatsappDto {
  @ApiProperty() id: string;
  @ApiProperty() estado: string;
  @ApiProperty({ type: String, format: 'date-time' }) ocurrido_en: Date;
  @ApiProperty({ nullable: true, type: String }) codigo_error: string | null;
}
export class NotificacionWhatsappDto {
  @ApiProperty() id: string;
  @ApiProperty() destinatario_id: string;
  @ApiProperty({ nullable: true, type: String }) alerta_id: string | null;
  @ApiProperty({ nullable: true, type: String }) toma_id: string | null;
  @ApiProperty() tipo: string;
  @ApiProperty() estado: string;
  @ApiProperty() intentos: number;
  @ApiProperty({ type: String, format: 'date-time' }) created_at: Date;
  @ApiProperty({ nullable: true, type: String }) codigo_error: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  siguiente_intento_en: Date | null;
  @ApiProperty({ type: [EstadoWhatsappDto] }) eventos: EstadoWhatsappDto[];
}
export class ConfiguracionWhatsappDto extends PreferenciasWhatsappDto {
  @ApiProperty() adulto_id: string;
}
export class IntegracionWhatsappDto {
  @ApiProperty() habilitada: boolean;
  @ApiProperty() procesador_habilitado: boolean;
  @ApiProperty() recordatorios_habilitados: boolean;
  @ApiProperty() prueba_configurada: boolean;
}
export class ResumenAlertaWhatsappDto {
  @ApiProperty() alerta_id: string;
  @ApiProperty() estado: string;
  @ApiProperty() cantidad: number;
}
