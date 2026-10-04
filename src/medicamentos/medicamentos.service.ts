import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateMedicamentoDto } from './dto/create-medicamento.dto.js';
import { UpdateMedicamentoDto } from './dto/update-medicamento.dto.js';

const SELECT_MEDICAMENTO = {
  id: true,
  adulto_id: true,
  nombre: true,
  descripcion: true,
  dosis: true,
  unidad_dosis: true,
  instrucciones: true,
  fecha_inicio: true,
  fecha_fin: true,
  zona_horaria: true,
  activo: true,
  creado_por: true,
  created_at: true,
  updated_at: true,
} as const;

@Injectable()
export class MedicamentosService {
  constructor(private readonly prisma: PrismaService) {}

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
        'No tienes permisos para gestionar los medicamentos de este adulto mayor.',
      );
    }
  }

  private validarRangoFechas(fechaInicio: Date, fechaFin?: Date | null): void {
    if (fechaFin && fechaFin < fechaInicio) {
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la fecha de inicio.',
      );
    }
  }

  async create(usuarioId: string, dto: CreateMedicamentoDto) {
    await this.assertCanManageAdulto(usuarioId, dto.adulto_id);

    const adulto = await this.prisma.usuarios.findUnique({
      where: { id: dto.adulto_id },
      select: { id: true, activo: true },
    });

    if (!adulto || !adulto.activo) {
      throw new NotFoundException('No se encontró el adulto mayor indicado.');
    }

    const fechaInicio = new Date(dto.fecha_inicio);
    const fechaFin = dto.fecha_fin ? new Date(dto.fecha_fin) : null;

    this.validarRangoFechas(fechaInicio, fechaFin);

    return this.prisma.medicamentos.create({
      data: {
        adulto_id: dto.adulto_id,
        nombre: dto.nombre.trim(),
        descripcion: dto.descripcion?.trim() || null,
        dosis: dto.dosis,
        unidad_dosis: dto.unidad_dosis.trim(),
        instrucciones: dto.instrucciones?.trim() || null,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        zona_horaria: dto.zona_horaria ?? undefined,
        creado_por: usuarioId,
      },
      select: SELECT_MEDICAMENTO,
    });
  }

  async findAll(
    usuarioId: string,
    options: { adultoId?: string; soloActivos: boolean },
  ) {
    const { adultoId, soloActivos } = options;

    if (adultoId) {
      await this.assertCanManageAdulto(usuarioId, adultoId);
    }

    const adultosIds = adultoId
      ? [adultoId]
      : await this.obtenerAdultosAccesibles(usuarioId);

    return this.prisma.medicamentos.findMany({
      where: {
        adulto_id: { in: adultosIds },
        ...(soloActivos ? { activo: true } : {}),
      },
      select: SELECT_MEDICAMENTO,
      orderBy: [{ adulto_id: 'asc' }, { fecha_inicio: 'desc' }, { nombre: 'asc' }],
    });
  }

  private async obtenerAdultosAccesibles(usuarioId: string): Promise<string[]> {
    const vinculos = await this.prisma.adulto_familiares.findMany({
      where: {
        familiar_id: usuarioId,
      },
      select: {
        adulto_id: true,
      },
    });

    return [...vinculos.map((v) => v.adulto_id), usuarioId];
  }

  async findOne(usuarioId: string, id: string) {
    const medicamento = await this.prisma.medicamentos.findUnique({
      where: { id },
      select: SELECT_MEDICAMENTO,
    });

    if (!medicamento) {
      throw new NotFoundException(`No se encontró el medicamento con ID ${id}.`);
    }

    await this.assertCanManageAdulto(usuarioId, medicamento.adulto_id);

    return medicamento;
  }

  async update(usuarioId: string, id: string, dto: UpdateMedicamentoDto) {
    const medicamento = await this.findOne(usuarioId, id);

    if (dto.activo === false) {
      throw new BadRequestException(
        'Para desactivar un medicamento usa el endpoint DELETE /medicamentos/:id.',
      );
    }

    const fechaInicio = dto.fecha_inicio
      ? new Date(dto.fecha_inicio)
      : medicamento.fecha_inicio;
    const fechaFin =
      dto.fecha_fin !== undefined
        ? dto.fecha_fin
          ? new Date(dto.fecha_fin)
          : null
        : medicamento.fecha_fin;

    this.validarRangoFechas(fechaInicio, fechaFin);

    return this.prisma.medicamentos.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.descripcion !== undefined
          ? { descripcion: dto.descripcion?.trim() || null }
          : {}),
        ...(dto.dosis !== undefined ? { dosis: dto.dosis } : {}),
        ...(dto.unidad_dosis !== undefined
          ? { unidad_dosis: dto.unidad_dosis.trim() }
          : {}),
        ...(dto.instrucciones !== undefined
          ? { instrucciones: dto.instrucciones?.trim() || null }
          : {}),
        ...(dto.fecha_inicio !== undefined ? { fecha_inicio: fechaInicio } : {}),
        ...(dto.fecha_fin !== undefined ? { fecha_fin: fechaFin } : {}),
        ...(dto.zona_horaria !== undefined
          ? { zona_horaria: dto.zona_horaria }
          : {}),
        updated_at: new Date(),
      },
      select: SELECT_MEDICAMENTO,
    });
  }


  async remove(usuarioId: string, id: string) {
    await this.findOne(usuarioId, id);

    return this.prisma.medicamentos.update({
      where: { id },
      data: {
        activo: false,
        updated_at: new Date(),
      },
      select: SELECT_MEDICAMENTO,
    });
  }
}
