import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActualizarConfiguracionDto } from './configuracion.dto.js';
@Injectable()
export class ConfiguracionService {
  constructor(private readonly prisma: PrismaService) {}
  private async verificarAdulto(id: string) {
    const u = await this.prisma.usuarios.findUnique({
      where: { id },
      select: { activo: true, roles: { select: { codigo: true } } },
    });
    if (!u?.activo || u.roles.codigo !== 'ADULTO_MAYOR')
      throw new ForbiddenException(
        'Los ajustes móviles corresponden al adulto mayor autenticado.',
      );
  }
  async obtener(id: string) {
    await this.verificarAdulto(id);
    const [c, familiares] = await Promise.all([
      this.prisma.configuracion_adulto.findUnique({ where: { adulto_id: id } }),
      this.prisma.adulto_familiares.count({
        where: {
          adulto_id: id,
          estado: 'ACTIVA',
          usuarios_adulto_familiares_familiar_idTousuarios: { activo: true },
        },
      }),
    ]);
    return {
      adulto_id: id,
      zona_horaria: c?.zona_horaria ?? 'America/Mexico_City',
      notificaciones_habilitadas: c?.notificaciones_habilitadas ?? true,
      recordatorio_medicamentos: c?.recordatorio_medicamentos ?? true,
      minutos_repeticion: c?.minutos_repeticion ?? 10,
      max_repeticiones: c?.max_repeticiones ?? 3,
      ubicacion_compartida: c?.ubicacion_compartida ?? true,
      familiares_activos: familiares,
    };
  }
  async actualizar(id: string, dto: ActualizarConfiguracionDto) {
    await this.verificarAdulto(id);
    if (dto.zona_horaria !== undefined) {
      try {
        new Intl.DateTimeFormat('es-MX', {
          timeZone: dto.zona_horaria,
        }).format();
      } catch {
        throw new BadRequestException('La zona horaria no es válida.');
      }
    }
    const data = {
      zona_horaria: dto.zona_horaria,
      notificaciones_habilitadas: dto.notificaciones_habilitadas,
      recordatorio_medicamentos: dto.recordatorio_medicamentos,
      minutos_repeticion: dto.minutos_repeticion,
      max_repeticiones: dto.max_repeticiones,
    };
    await this.prisma.configuracion_adulto.upsert({
      where: { adulto_id: id },
      create: { adulto_id: id, ...data },
      update: { ...data, updated_at: new Date() },
    });
    return this.obtener(id);
  }
}
