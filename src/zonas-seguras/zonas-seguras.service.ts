import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateZonaSeguraDto } from './dto/create-zona-segura.dto.js';
import { UpdateZonaSeguraDto } from './dto/update-zona-segura.dto.js';

const SELECT_ZONA = {
  id: true,
  adulto_id: true,
  nombre: true,
  latitud_centro: true,
  longitud_centro: true,
  radio_metros: true,
  notificar_salida: true,
  notificar_entrada: true,
  activa: true,
  created_at: true,
  updated_at: true,
} as const;

@Injectable()
export class ZonasSegurasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida que el usuario autenticado pueda operar sobre el adulto indicado:
   * - El propio adulto (dueño de sus zonas).
   * - Un familiar vinculado en adulto_familiares (relación ACTIVA).
   */
  private async assertCanManageAdulto(
    usuarioId: string,
    adultoId: string,
  ): Promise<void> {
    if (usuarioId === adultoId) {
      return;
    }

    const vinculo = await this.prisma.adulto_familiares.findFirst({
      where: {
        adulto_id: adultoId,
        familiar_id: usuarioId,
        estado: 'ACTIVA',
      },
      select: { id: true },
    });

    if (!vinculo) {
      throw new ForbiddenException(
        'No tienes permisos para gestionar las zonas seguras de este adulto mayor.',
      );
    }
  }

  async create(usuarioId: string, dto: CreateZonaSeguraDto) {
    await this.assertCanManageAdulto(usuarioId, dto.adulto_id);

    const adulto = await this.prisma.usuarios.findUnique({
      where: { id: dto.adulto_id },
      select: { id: true, activo: true },
    });

    if (!adulto || !adulto.activo) {
      throw new NotFoundException('No se encontró el adulto mayor indicado.');
    }

    const nombre = dto.nombre.trim();

    const duplicado = await this.prisma.zonas_seguras.findFirst({
      where: {
        adulto_id: dto.adulto_id,
        nombre,
      },
      select: { id: true },
    });

    if (duplicado) {
      throw new ConflictException(
        'Ya existe una zona segura con ese nombre para este adulto mayor.',
      );
    }

    return this.prisma.zonas_seguras.create({
      data: {
        adulto_id: dto.adulto_id,
        nombre,
        latitud_centro: dto.latitud_centro,
        longitud_centro: dto.longitud_centro,
        radio_metros: dto.radio_metros,
        notificar_salida: dto.notificar_salida ?? true,
        notificar_entrada: dto.notificar_entrada ?? false,
      },
      select: SELECT_ZONA,
    });
  }

  async findAll(
    usuarioId: string,
    options: { adultoId?: string; soloActivas: boolean },
  ) {
    const { adultoId, soloActivas } = options;

    if (adultoId) {
      await this.assertCanManageAdulto(usuarioId, adultoId);
    }

    const adultosIds = adultoId
      ? [adultoId]
      : await this.obtenerAdultosAccesibles(usuarioId);

    return this.prisma.zonas_seguras.findMany({
      where: {
        adulto_id: { in: adultosIds },
        ...(soloActivas ? { activa: true } : {}),
      },
      select: SELECT_ZONA,
      orderBy: [{ adulto_id: 'asc' }, { nombre: 'asc' }],
    });
  }

  private async obtenerAdultosAccesibles(usuarioId: string): Promise<string[]> {
    const vinculos = await this.prisma.adulto_familiares.findMany({
      where: { familiar_id: usuarioId },
      select: { adulto_id: true },
    });

    return [...vinculos.map((v) => v.adulto_id), usuarioId];
    // El adulto siempre accede a sus propias zonas.
  }

  async findOne(usuarioId: string, id: string) {
    const zona = await this.prisma.zonas_seguras.findUnique({
      where: { id },
      select: SELECT_ZONA,
    });

    if (!zona) {
      throw new NotFoundException(`No se encontró la zona segura con ID ${id}.`);
    }

    await this.assertCanManageAdulto(usuarioId, zona.adulto_id);

    return zona;
  }

  async update(usuarioId: string, id: string, dto: UpdateZonaSeguraDto) {
    const zona = await this.findOne(usuarioId, id);

    if (dto.activa === false) {
      throw new BadRequestException(
        'Para desactivar una zona usa el endpoint DELETE /zonas-seguras/:id.',
      );
    }

    if (dto.nombre && dto.nombre.trim() !== zona.nombre) {
      const duplicado = await this.prisma.zonas_seguras.findFirst({
        where: {
          adulto_id: zona.adulto_id,
          nombre: dto.nombre.trim(),
          NOT: { id },
        },
        select: { id: true },
      });

      if (duplicado) {
        throw new ConflictException(
          'Ya existe una zona segura con ese nombre para este adulto mayor.',
        );
      }
    }

    return this.prisma.zonas_seguras.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.latitud_centro !== undefined
          ? { latitud_centro: dto.latitud_centro }
          : {}),
        ...(dto.longitud_centro !== undefined
          ? { longitud_centro: dto.longitud_centro }
          : {}),
        ...(dto.radio_metros !== undefined
          ? { radio_metros: dto.radio_metros }
          : {}),
        ...(dto.notificar_salida !== undefined
          ? { notificar_salida: dto.notificar_salida }
          : {}),
        ...(dto.notificar_entrada !== undefined
          ? { notificar_entrada: dto.notificar_entrada }
          : {}),
        updated_at: new Date(),
      },
      select: SELECT_ZONA,
    });
  }

  /** Soft delete: la zona queda inactiva (historial de alertas preservado). */
  async remove(usuarioId: string, id: string) {
    await this.findOne(usuarioId, id);

    return this.prisma.zonas_seguras.update({
      where: { id },
      data: { activa: false, updated_at: new Date() },
      select: SELECT_ZONA,
    });
  }
}
