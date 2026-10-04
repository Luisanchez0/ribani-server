import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MedicamentosService } from '../medicamentos/medicamentos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { CreateHorarioDto } from './dto/create-horario.dto.js';
import { UpdateHorarioDto } from './dto/update-horario.dto.js';

const SELECT_HORARIO = {
  id: true,
  medicamento_id: true,
  hora_local: true,
  dias_semana: true,
  intervalo_minutos: true,
  ventana_minutos: true,
  activo: true,
  created_at: true,
} as const;

const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

@Injectable()
export class HorariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medicamentosService: MedicamentosService,
  ) {}

  /**
   * Convierte "HH:MM" o "HH:MM:SS" a Date anclada en 1970-01-01 UTC para
   * persistir la hora pura en la columna Time(6).
   */
  private normalizarHora(hora: string): Date {
    const match = HORA_REGEX.exec(hora.trim());

    if (!match) {
      throw new BadRequestException(
        'Formato de hora inválido. Usa HH:MM o HH:MM:SS (ejemplo: "08:30").',
      );
    }

    const [, hh, mm, ss] = match;

    return new Date(`1970-01-01T${hh}:${mm}:${ss ?? '00'}Z`);
  }

  /**
   * Reutiliza la autorización de medicamentos: 404 si no existe,
   * 403 si el usuario no es el adulto ni un familiar vinculado.
   */
  private async resolverMedicamento(
    usuarioId: string,
    medicamentoId: string,
  ) {
    return this.medicamentosService.findOne(usuarioId, medicamentoId);
  }

  private async assertSinDuplicado(
    medicamentoId: string,
    horaLocal: Date,
    excluirId?: string,
  ): Promise<void> {
    const duplicado = await this.prisma.horarios_medicamento.findFirst({
      where: {
        medicamento_id: medicamentoId,
        hora_local: horaLocal,
        activo: true,
        ...(excluirId ? { NOT: { id: excluirId } } : {}),
      },
      select: { id: true },
    });

    if (duplicado) {
      throw new ConflictException(
        'El medicamento ya tiene un horario activo a esa hora.',
      );
    }
  }

  async create(
    usuarioId: string,
    medicamentoId: string,
    dto: CreateHorarioDto,
  ) {
    const medicamento = await this.resolverMedicamento(usuarioId, medicamentoId);

    if (!medicamento.activo) {
      throw new BadRequestException(
        'No se pueden agregar horarios a un medicamento inactivo.',
      );
    }

    const horaLocal = this.normalizarHora(dto.hora_local);

    await this.assertSinDuplicado(medicamentoId, horaLocal);

    return this.prisma.horarios_medicamento.create({
      data: {
        medicamento_id: medicamentoId,
        hora_local: horaLocal,
        ...(dto.dias_semana !== undefined ? { dias_semana: dto.dias_semana } : {}),
        ...(dto.intervalo_minutos !== undefined
          ? { intervalo_minutos: dto.intervalo_minutos }
          : {}),
        ...(dto.ventana_minutos !== undefined
          ? { ventana_minutos: dto.ventana_minutos }
          : {}),
      },
      select: SELECT_HORARIO,
    });
  }

  async findAll(
    usuarioId: string,
    medicamentoId: string,
    soloActivos: boolean,
  ) {
    await this.resolverMedicamento(usuarioId, medicamentoId);

    return this.prisma.horarios_medicamento.findMany({
      where: {
        medicamento_id: medicamentoId,
        ...(soloActivos ? { activo: true } : {}),
      },
      select: SELECT_HORARIO,
      orderBy: [{ hora_local: 'asc' }, { created_at: 'asc' }],
    });
  }

  async findOne(usuarioId: string, medicamentoId: string, id: string) {
    await this.resolverMedicamento(usuarioId, medicamentoId);

    const horario = await this.prisma.horarios_medicamento.findUnique({
      where: { id },
      select: SELECT_HORARIO,
    });

    // Si pertenece a otro medicamento se reporta como no encontrado
    // para no filtrar su existencia.
    if (!horario || horario.medicamento_id !== medicamentoId) {
      throw new NotFoundException(`No se encontró el horario con ID ${id}.`);
    }

    return horario;
  }

  async update(
    usuarioId: string,
    medicamentoId: string,
    id: string,
    dto: UpdateHorarioDto,
  ) {
    const horario = await this.findOne(usuarioId, medicamentoId, id);

    if (dto.activo === false) {
      throw new BadRequestException(
        'Para desactivar un horario usa el endpoint DELETE /medicamentos/:medicamentoId/horarios/:id.',
      );
    }

    let horaLocal = horario.hora_local;

    if (dto.hora_local !== undefined) {
      horaLocal = this.normalizarHora(dto.hora_local);
      await this.assertSinDuplicado(medicamentoId, horaLocal, id);
    }

    return this.prisma.horarios_medicamento.update({
      where: { id },
      data: {
        ...(dto.hora_local !== undefined ? { hora_local: horaLocal } : {}),
        ...(dto.dias_semana !== undefined ? { dias_semana: dto.dias_semana } : {}),
        ...(dto.intervalo_minutos !== undefined
          ? { intervalo_minutos: dto.intervalo_minutos }
          : {}),
        ...(dto.ventana_minutos !== undefined
          ? { ventana_minutos: dto.ventana_minutos }
          : {}),
      },
      select: SELECT_HORARIO,
    });
  }

  /**
   * Soft delete: tomas_medicamento puede referenciar este horario,
   * por lo que NO se elimina físicamente.
   */
  async remove(usuarioId: string, medicamentoId: string, id: string) {
    await this.findOne(usuarioId, medicamentoId, id);

    return this.prisma.horarios_medicamento.update({
      where: { id },
      data: {
        activo: false,
      },
      select: SELECT_HORARIO,
    });
  }
}
