import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateContactoDto } from './dto/create-contacto.dto.js';
import { UpdateContactoDto } from './dto/update-contacto.dto.js';

const SELECT_CONTACTO = {
  id: true,
  adulto_id: true,
  nombre: true,
  parentesco: true,
  telefono: true,
  email: true,
  prioridad: true,
  activo: true,
  created_at: true,
} as const;

@Injectable()
export class ContactosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida que el usuario autenticado pueda operar sobre el adulto indicado:
   * - El propio adulto (dueño de sus contactos).
   * - Un familiar vinculado en adulto_familiares.
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
      },
      select: {
        id: true,
      },
    });

    if (!vinculo) {
      throw new ForbiddenException(
        'No tienes permisos para gestionar los contactos de este adulto mayor.',
      );
    }
  }

  async create(usuarioId: string, dto: CreateContactoDto) {
    await this.assertCanManageAdulto(usuarioId, dto.adulto_id);

    const adulto = await this.prisma.usuarios.findUnique({
      where: { id: dto.adulto_id },
      select: { id: true, activo: true },
    });

    if (!adulto || !adulto.activo) {
      throw new NotFoundException('No se encontró el adulto mayor indicado.');
    }

    // prioridad: default 1; única por adulto según @@unique([adulto_id, prioridad])
    const prioridad = dto.prioridad ?? 1;

    const existenteMismaPrioridad = await this.prisma.contactos_emergencia.findFirst({
      where: {
        adulto_id: dto.adulto_id,
        prioridad,
      },
      select: { id: true },
    });

    if (existenteMismaPrioridad) {
      throw new ConflictException(
        `El adulto mayor ya tiene un contacto con la prioridad ${prioridad}.`,
      );
    }

    const telefonoDuplicado = await this.prisma.contactos_emergencia.findFirst({
      where: {
        adulto_id: dto.adulto_id,
        telefono: dto.telefono,
        activo: true,
      },
      select: { id: true },
    });

    if (telefonoDuplicado) {
      throw new ConflictException(
        'Ya existe un contacto de emergencia con ese teléfono para este adulto mayor.',
      );
    }

    return this.prisma.contactos_emergencia.create({
      data: {
        adulto_id: dto.adulto_id,
        nombre: dto.nombre.trim(),
        parentesco: dto.parentesco?.trim() || null,
        telefono: dto.telefono.trim(),
        email: dto.email?.trim() || null,
        prioridad,
      },
      select: SELECT_CONTACTO,
    });
  }

  async findAll(usuarioId: string, soloActivos: boolean) {
    // Si el usuario es familiar, lista los contactos de los adultos vinculados.
    const vinculos = await this.prisma.adulto_familiares.findMany({
      where: {
        familiar_id: usuarioId,
      },
      select: {
        adulto_id: true,
      },
    });

    const adultosIds = [...vinculos.map((v) => v.adulto_id), usuarioId];

    return this.prisma.contactos_emergencia.findMany({
      where: {
        adulto_id: { in: adultosIds },
        ...(soloActivos ? { activo: true } : {}),
      },
      select: SELECT_CONTACTO,
      orderBy: [{ adulto_id: 'asc' }, { prioridad: 'asc' }],
    });
  }

  async findOne(usuarioId: string, id: string) {
    const contacto = await this.prisma.contactos_emergencia.findUnique({
      where: { id },
      select: SELECT_CONTACTO,
    });

    if (!contacto) {
      throw new NotFoundException(`No se encontró el contacto con ID ${id}.`);
    }

    await this.assertCanManageAdulto(usuarioId, contacto.adulto_id);

    return contacto;
  }

  async update(usuarioId: string, id: string, dto: UpdateContactoDto) {
    const contacto = await this.findOne(usuarioId, id);

    if (dto.activo === false) {
      throw new BadRequestException(
        'Para desactivar un contacto usa el endpoint DELETE /contactos/:id.',
      );
    }

    const prioridad = dto.prioridad ?? contacto.prioridad;

    if (prioridad !== contacto.prioridad) {
      const existenteMismaPrioridad =
        await this.prisma.contactos_emergencia.findFirst({
          where: {
            adulto_id: contacto.adulto_id,
            prioridad,
            NOT: { id },
          },
          select: { id: true },
        });

      if (existenteMismaPrioridad) {
        throw new ConflictException(
          `El adulto mayor ya tiene un contacto con la prioridad ${prioridad}.`,
        );
      }
    }

    if (dto.telefono && dto.telefono.trim() !== contacto.telefono) {
      const telefonoDuplicado =
        await this.prisma.contactos_emergencia.findFirst({
          where: {
            adulto_id: contacto.adulto_id,
            telefono: dto.telefono.trim(),
            activo: true,
            NOT: { id },
          },
          select: { id: true },
        });

      if (telefonoDuplicado) {
        throw new ConflictException(
          'Ya existe un contacto de emergencia con ese teléfono para este adulto mayor.',
        );
      }
    }

    return this.prisma.contactos_emergencia.update({
      where: { id },
      data: {
        nombre: dto.nombre?.trim(),
        parentesco: dto.parentesco?.trim() || null,
        telefono: dto.telefono?.trim(),
        email: dto.email?.trim() || null,
        prioridad,
      },
      select: SELECT_CONTACTO,
    });
  }

  /**
   * Soft delete: los registros de whatsapp_destinatarios pueden referenciar
   * este contacto, por lo que NO se elimina físicamente.
   */
  async remove(usuarioId: string, id: string) {
    await this.findOne(usuarioId, id);

    return this.prisma.contactos_emergencia.update({
      where: { id },
      data: {
        activo: false,
      },
      select: SELECT_CONTACTO,
    });
  }
}
