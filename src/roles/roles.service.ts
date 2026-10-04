import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { AsignarPermisosDto } from './dto/asignar-permisos.dto.js';
import { UpdateRolDto } from './dto/update-rol.dto.js';

/**
 * La BD es una enumeración cerrada (CHECK roles_codigo_chk): solo existen
 * los 3 roles del sistema y no se pueden crear ni eliminar. La gestión
 * RBAC consiste en asignar/quitar permisos a esos roles.
 */
const ROLES_DEL_SISTEMA = new Set(['ADULTO_MAYOR', 'FAMILIAR_ENCARGADO', 'ADMINISTRADOR']);

interface PermisoBD {
  id: bigint;
  codigo: string;
  recurso: string;
  accion: string;
  descripcion: string | null;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Lista todos los roles con sus permisos. */
  async listar() {
    const roles = await this.prisma.roles.findMany({
      orderBy: { id: 'asc' },
      include: {
        rol_permisos: {
          include: { permisos: true },
          orderBy: { permiso_id: 'asc' },
        },
      },
    });

    return roles.map((rol) => this.serializarRol(rol));
  }

  /** Obtiene un rol con sus permisos. */
  async obtener(id: number) {
    const rol = await this.prisma.roles.findUnique({
      where: { id },
      include: {
        rol_permisos: {
          include: { permisos: true },
          orderBy: { permiso_id: 'asc' },
        },
      },
    });

    if (!rol) {
      throw new NotFoundException('Rol no encontrado.');
    }

    return this.serializarRol(rol);
  }

  /**
   * Actualiza nombre/descripcion de un rol. Los roles del sistema no se
   * pueden desactivar (dejarían cuentas sin rol válido).
   */
  async actualizar(actorId: string, id: number, dto: UpdateRolDto) {
    const rol = await this.prisma.roles.findUnique({
      where: { id },
      select: { id: true, codigo: true },
    });

    if (!rol) {
      throw new NotFoundException('Rol no encontrado.');
    }

    if (dto.activo === false && ROLES_DEL_SISTEMA.has(rol.codigo)) {
      throw new ConflictException(
        'Los roles del sistema no se pueden desactivar.',
      );
    }

    await this.prisma.roles.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.descripcion !== undefined
          ? { descripcion: dto.descripcion }
          : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
    });

    await this.auditoria.registrar({
      actorId,
      accion: 'ROL_ACTUALIZADO',
      entidad: 'roles',
      entidadId: String(id),
      datosDespues: { ...dto },
    });

    return this.obtener(id);
  }

  /**
   * Reemplaza la lista completa de permisos del rol (transaccional).
   * Array vacio = revocar todos. Queda en auditoria el detalle del cambio.
   */
  async asignarPermisos(actorId: string, id: number, dto: AsignarPermisosDto) {
    const rol = await this.prisma.roles.findUnique({
      where: { id },
      select: { id: true, codigo: true },
    });

    if (!rol) {
      throw new NotFoundException('Rol no encontrado.');
    }

    const codigosUnicos = [...new Set(dto.permisos)];

    const permisos = await this.prisma.permisos.findMany({
      where: { codigo: { in: codigosUnicos } },
      select: { id: true, codigo: true },
    });

    if (permisos.length !== codigosUnicos.length) {
      const encontrados = new Set(permisos.map((p) => p.codigo));
      const faltantes = codigosUnicos.filter((c) => !encontrados.has(c));
      throw new BadRequestException(
        `Permisos inexistentes: ${faltantes.join(', ')}.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.rol_permisos.deleteMany({ where: { rol_id: id } }),
      this.prisma.rol_permisos.createMany({
        data: permisos.map((p) => ({ rol_id: id, permiso_id: p.id })),
      }),
    ]);

    await this.auditoria.registrar({
      actorId,
      accion: 'ROL_PERMISOS_ACTUALIZADOS',
      entidad: 'roles',
      entidadId: String(id),
      datosDespues: { rol: rol.codigo, permisos: codigosUnicos },
    });

    return this.obtener(id);
  }

  /**
   * Los roles del sistema no se pueden eliminar: están en el CHECK de la
   * BD y tienen usuarios asignados.
   */
  async remove(actorId: string, id: number) {
    const rol = await this.prisma.roles.findUnique({
      where: { id },
      select: { id: true, codigo: true },
    });

    if (!rol) {
      throw new NotFoundException('Rol no encontrado.');
    }

    if (ROLES_DEL_SISTEMA.has(rol.codigo)) {
      throw new ConflictException(
        'Los roles del sistema no se pueden eliminar.',
      );
    }

    const usuarios = await this.prisma.usuarios.count({
      where: { rol_id: id },
    });

    if (usuarios > 0) {
      throw new ConflictException(
        `El rol tiene ${usuarios} usuario(s) asignado(s); reasignelos antes de darlo de baja.`,
      );
    }

    await this.prisma.roles.update({
      where: { id },
      data: { activo: false },
    });

    await this.auditoria.registrar({
      actorId,
      accion: 'ROL_DESACTIVADO',
      entidad: 'roles',
      entidadId: String(id),
      datosDespues: { codigo: rol.codigo },
    });

    return this.obtener(id);
  }

  /** Lista todos los permisos disponibles (para el selector del panel). */
  async listarPermisos() {
    const permisos = await this.prisma.permisos.findMany({
      orderBy: { codigo: 'asc' },
    });

    return permisos.map((p) => this.serializarPermiso(p));
  }

  private serializarRol(rol: {
    id: number;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    activo: boolean;
    rol_permisos: { permisos: PermisoBD }[];
  }) {
    const { rol_permisos, ...datos } = rol;
    return {
      ...datos,
      permisos: rol_permisos.map((rp) => this.serializarPermiso(rp.permisos)),
    };
  }

  /** El id de permisos es BigInt: se serializa a string para JSON. */
  private serializarPermiso(p: PermisoBD) {
    return {
      id: p.id.toString(),
      codigo: p.codigo,
      recurso: p.recurso,
      accion: p.accion,
      descripcion: p.descripcion,
    };
  }
}
