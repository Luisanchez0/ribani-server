import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';
import { MedicamentosService } from '../medicamentos/medicamentos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { CreateTomaDto } from './dto/create-toma.dto.js';
import { UpdateTomaDto } from './dto/update-toma.dto.js';
import {
  ESTADOS_PENDIENTES,
  MINUTOS_POSPONER,
  recordarEn,
} from './toma-pendiente.js';

const SELECT_TOMA = {
  id: true,
  medicamento_id: true,
  horario_id: true,
  adulto_id: true,
  programada_para: true,
  estado: true,
  tomada_en: true,
  dosis_tomada: true,
  registrada_por: true,
  nota: true,
  created_at: true,
  updated_at: true,
} as const;

const ESTADOS_VALIDOS = [
  'PENDIENTE',
  'POSPUESTA',
  'TOMADA',
  'OMITIDA',
  'CANCELADA',
] as const;

const DIAS_SEMANA: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const MS_POR_MINUTO = 60_000;

@Injectable()
export class TomasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medicamentosService: MedicamentosService,
  ) {}

  /**
   * Reutiliza la autorización de medicamentos: 404 si no existe,
   * 403 si el usuario no es el adulto ni un familiar vinculado.
   */
  private async resolverMedicamento(usuarioId: string, medicamentoId: string) {
    return this.medicamentosService.findOne(usuarioId, medicamentoId);
  }

  /**
   * Obtiene la hora del día (en minutos) y el día de la semana (1-7) de una
   * fecha, evaluados en la zona horaria indicada.
   */
  private partesLocales(
    fecha: Date,
    zonaHoraria: string,
  ): { minutosDelDia: number; diaSemana: number } {
    try {
      const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: zonaHoraria,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(fecha);

      const obtener = (tipo: string) =>
        partes.find((parte) => parte.type === tipo)?.value ?? '';

      const horas = Number(obtener('hour'));
      const minutos = Number(obtener('minute'));
      const diaSemana = DIAS_SEMANA[obtener('weekday')] ?? 0;

      return { minutosDelDia: horas * 60 + minutos, diaSemana };
    } catch {
      throw new BadRequestException(
        'La zona horaria del medicamento no es válida.',
      );
    }
  }

  private horaMinutosDelDia(horaLocal: Date): number {
    return horaLocal.getUTCHours() * 60 + horaLocal.getUTCMinutes();
  }

  /**
   * Valida que programada_para coincida con el horario del medicamento:
   * - Sin intervalo: la hora local debe ser exactamente hora_local y el día
   *   de la semana debe estar en dias_semana.
   * - Con intervalo: la hora local debe ser hora_local + k * intervalo y el
   *   día debe estar en dias_semana solo en la primera toma del día.
   */
  private async validarProgramadaContraHorario(
    horarioId: string,
    medicamentoId: string,
    programadaPara: Date,
    zonaHoraria: string,
  ): Promise<void> {
    const horario = await this.prisma.horarios_medicamento.findUnique({
      where: { id: horarioId },
      select: {
        id: true,
        medicamento_id: true,
        hora_local: true,
        dias_semana: true,
        intervalo_minutos: true,
        activo: true,
      },
    });

    if (!horario || horario.medicamento_id !== medicamentoId) {
      throw new NotFoundException(
        `No se encontró el horario con ID ${horarioId} para este medicamento.`,
      );
    }

    if (!horario.activo) {
      throw new BadRequestException(
        'El horario indicado está inactivo. Actívalo o usa otro horario.',
      );
    }

    const { minutosDelDia, diaSemana } = this.partesLocales(
      programadaPara,
      zonaHoraria,
    );
    const horaProgramada = this.horaMinutosDelDia(horario.hora_local);
    const diferencia = (minutosDelDia - horaProgramada + 1440) % 1440;

    if (horario.intervalo_minutos === 0) {
      const coincide =
        diferencia === 0 && horario.dias_semana.includes(diaSemana);

      if (!coincide) {
        throw new BadRequestException(
          `programada_para no coincide con el horario: debe ser a las ${this.formatearHora(
            horaProgramada,
          )} en los días ${horario.dias_semana.join(', ')} (zona ${zonaHoraria}).`,
        );
      }

      return;
    }

    // Con intervalo: la primera toma del día respeta dias_semana; las
    // repeticiones caen en hora_local + k * intervalo_minutos el mismo día.
    const esMultiplo = diferencia % horario.intervalo_minutos === 0;
    const diaValido =
      diferencia !== 0 || horario.dias_semana.includes(diaSemana);

    if (!esMultiplo || !diaValido) {
      throw new BadRequestException(
        `programada_para debe ser hora_local + múltiplos de ${horario.intervalo_minutos} minutos desde las ${this.formatearHora(horaProgramada)}.`,
      );
    }
  }

  private formatearHora(minutosDelDia: number): string {
    const horas = Math.floor(minutosDelDia / 60)
      .toString()
      .padStart(2, '0');
    const minutos = (minutosDelDia % 60).toString().padStart(2, '0');

    return `${horas}:${minutos}`;
  }

  /**
   * Valida la ventana del horario: la toma real debe registrarse entre
   * programada_para y programada_para + ventana_minutos.
   */
  private validarVentana(
    ventanaMinutos: number,
    programadaPara: Date,
    tomadaEn: Date,
  ): void {
    if (tomadaEn < programadaPara) {
      throw new BadRequestException(
        'La toma no puede registrarse antes de la hora programada.',
      );
    }

    const limite = programadaPara.getTime() + ventanaMinutos * MS_POR_MINUTO;

    if (tomadaEn.getTime() > limite) {
      throw new BadRequestException(
        `La toma está fuera de la ventana de ${ventanaMinutos} minutos posteriores a la hora programada.`,
      );
    }
  }

  async create(usuarioId: string, dto: CreateTomaDto) {
    const medicamento = await this.resolverMedicamento(
      usuarioId,
      dto.medicamento_id,
    );

    if (!medicamento.activo) {
      throw new BadRequestException(
        'No se pueden registrar tomas de un medicamento inactivo.',
      );
    }

    const programadaPara = new Date(dto.programada_para);

    if (Number.isNaN(programadaPara.getTime())) {
      throw new BadRequestException('programada_para no es una fecha válida.');
    }

    if (dto.horario_id) {
      await this.validarProgramadaContraHorario(
        dto.horario_id,
        medicamento.id,
        programadaPara,
        medicamento.zona_horaria,
      );

      const duplicada = await this.prisma.tomas_medicamento.findFirst({
        where: {
          horario_id: dto.horario_id,
          programada_para: programadaPara,
        },
        select: { id: true },
      });

      if (duplicada) {
        throw new ConflictException(
          'Ya existe una toma programada para ese horario y hora.',
        );
      }
    }

    const creada = await this.prisma.tomas_medicamento.create({
      data: {
        medicamento_id: medicamento.id,
        adulto_id: medicamento.adulto_id,
        ...(dto.horario_id ? { horario_id: dto.horario_id } : {}),
        programada_para: programadaPara,
        ...(dto.nota !== undefined ? { nota: dto.nota?.trim() || null } : {}),
      },
      select: SELECT_TOMA,
    });
    return { ...creada, recordar_en: recordarEn(creada) };
  }

  private async obtenerAdultosAccesibles(usuarioId: string): Promise<string[]> {
    const vinculos = await this.prisma.adulto_familiares.findMany({
      where: {
        familiar_id: usuarioId,
        estado: 'ACTIVA',
        puede_gestionar_medicamentos: true,
      },
      select: {
        adulto_id: true,
      },
    });

    return [...vinculos.map((v) => v.adulto_id), usuarioId];
  }

  private async assertPuedeVerAdulto(
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
        puede_gestionar_medicamentos: true,
      },
      select: { id: true },
    });

    if (!vinculo) {
      throw new ForbiddenException(
        'No tienes permisos para ver las tomas de este adulto mayor.',
      );
    }
  }

  async findAll(
    usuarioId: string,
    filtros: {
      adultoId?: string;
      medicamentoId?: string;
      estado?: string;
      desde?: string;
      hasta?: string;
    },
  ) {
    const { adultoId, medicamentoId, estado, desde, hasta } = filtros;

    if (estado && !ESTADOS_VALIDOS.includes(estado as never)) {
      throw new BadRequestException(
        `estado debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}.`,
      );
    }

    if (adultoId) {
      await this.assertPuedeVerAdulto(usuarioId, adultoId);
    }

    if (medicamentoId) {
      await this.resolverMedicamento(usuarioId, medicamentoId);
    }

    const desdeFecha = desde ? new Date(desde) : undefined;
    const hastaFecha = hasta ? new Date(hasta) : undefined;

    if (desde && Number.isNaN(desdeFecha?.getTime())) {
      throw new BadRequestException('desde no es una fecha válida.');
    }

    if (hasta && Number.isNaN(hastaFecha?.getTime())) {
      throw new BadRequestException('hasta no es una fecha válida.');
    }

    const adultosIds = adultoId
      ? [adultoId]
      : await this.obtenerAdultosAccesibles(usuarioId);

    const filas = await this.prisma.tomas_medicamento.findMany({
      where: {
        adulto_id: { in: adultosIds },
        ...(medicamentoId ? { medicamento_id: medicamentoId } : {}),
        ...(estado
          ? {
              estado:
                estado === 'PENDIENTE' ? { in: ESTADOS_PENDIENTES } : estado,
            }
          : {}),
        ...(desdeFecha || hastaFecha
          ? {
              programada_para: {
                ...(desdeFecha ? { gte: desdeFecha } : {}),
                ...(hastaFecha ? { lte: hastaFecha } : {}),
              },
            }
          : {}),
      },
      select: SELECT_TOMA,
      orderBy: [{ programada_para: 'desc' }],
    });
    return filas.map((t) => ({ ...t, recordar_en: recordarEn(t) }));
  }

  async findOne(usuarioId: string, id: string) {
    const toma = await this.prisma.tomas_medicamento.findUnique({
      where: { id },
      select: SELECT_TOMA,
    });

    if (!toma) {
      throw new NotFoundException(`No se encontró la toma con ID ${id}.`);
    }

    // La autorización depende del medicamento al que pertenece la toma.
    await this.resolverMedicamento(usuarioId, toma.medicamento_id);

    return { ...toma, recordar_en: recordarEn(toma) };
  }

  async posponer(usuarioId: string, id: string) {
    const toma = await this.findOne(usuarioId, id);
    if (toma.estado !== 'PENDIENTE')
      throw new ConflictException(
        'Solo puedes posponer una vez una toma pendiente.',
      );
    const medicamento = await this.resolverMedicamento(
      usuarioId,
      toma.medicamento_id,
    );
    if (!medicamento.activo)
      throw new BadRequestException('El medicamento está inactivo.');
    const horario = toma.horario_id
      ? await this.prisma.horarios_medicamento.findUnique({
          where: { id: toma.horario_id },
          select: { ventana_minutos: true },
        })
      : null;
    const ahora = new Date();
    this.validarVentana(
      horario?.ventana_minutos ?? 60,
      toma.programada_para,
      ahora,
    );
    this.validarVentana(
      horario?.ventana_minutos ?? 60,
      toma.programada_para,
      new Date(ahora.getTime() + MINUTOS_POSPONER * MS_POR_MINUTO),
    );
    const r = await this.prisma.tomas_medicamento.updateMany({
      where: { id, estado: 'PENDIENTE' },
      data: { estado: 'POSPUESTA', updated_at: ahora },
    });
    if (r.count !== 1)
      throw new ConflictException(
        'La toma cambió mientras se intentaba posponer. Actualiza los datos.',
      );
    return this.findOne(usuarioId, id);
  }

  async update(usuarioId: string, id: string, dto: UpdateTomaDto) {
    const toma = await this.findOne(usuarioId, id);

    if (!ESTADOS_PENDIENTES.includes(toma.estado)) {
      throw new ConflictException(
        `La toma ya fue registrada con estado ${toma.estado} y no puede modificarse.`,
      );
    }

    // Solo actualizar nota
    if (!dto.estado) {
      if (toma.estado === 'POSPUESTA')
        throw new ConflictException(
          'Registra la toma antes de editar su nota; el aplazamiento conserva su hora.',
        );
      await this.actualizarPendiente(id, toma.estado, {
        ...(dto.nota !== undefined ? { nota: dto.nota?.trim() || null } : {}),
        updated_at: new Date(),
      });
      return this.findOne(usuarioId, id);
    }

    const medicamento = await this.resolverMedicamento(
      usuarioId,
      toma.medicamento_id,
    );

    if (dto.estado === 'TOMADA') {
      if (!medicamento.activo)
        throw new BadRequestException(
          'No puedes registrar una toma de un medicamento inactivo.',
        );
      const tomadaEn = dto.tomada_en ? new Date(dto.tomada_en) : new Date();

      if (Number.isNaN(tomadaEn.getTime())) {
        throw new BadRequestException('tomada_en no es una fecha válida.');
      }

      if (toma.horario_id) {
        const horario = await this.prisma.horarios_medicamento.findUnique({
          where: { id: toma.horario_id },
          select: { ventana_minutos: true },
        });

        // La ventana existe siempre (default 60), pero se verifica por si acaso.
        if (horario?.ventana_minutos != null) {
          this.validarVentana(
            horario.ventana_minutos,
            toma.programada_para,
            tomadaEn,
          );
        }
      }

      await this.actualizarPendiente(id, toma.estado, {
        estado: 'TOMADA',
        tomada_en: tomadaEn,
        dosis_tomada: dto.dosis_tomada ?? medicamento.dosis,
        registrada_por: usuarioId,
        ...(dto.nota !== undefined ? { nota: dto.nota?.trim() || null } : {}),
        updated_at: new Date(),
      });
      return this.findOne(usuarioId, id);
    }

    // OMITIDA: se puede omitir en cualquier momento (sin ventana).
    await this.actualizarPendiente(id, toma.estado, {
      estado: 'OMITIDA',
      registrada_por: usuarioId,
      ...(dto.nota !== undefined ? { nota: dto.nota?.trim() || null } : {}),
      updated_at: new Date(),
    });
    return this.findOne(usuarioId, id);
  }

  private async actualizarPendiente(
    id: string,
    estado: string,
    data: Prisma.tomas_medicamentoUncheckedUpdateManyInput,
  ) {
    const r = await this.prisma.tomas_medicamento.updateMany({
      where: { id, estado },
      data,
    });
    if (r.count !== 1)
      throw new ConflictException('La toma ya cambió. Actualiza los datos.');
  }

  /**
   * Solo se eliminan tomas PENDIENTE (las registradas quedan como historial).
   * Si la toma ya tiene notificaciones asociadas se rechaza el borrado físico.
   */
  async remove(usuarioId: string, id: string) {
    const toma = await this.findOne(usuarioId, id);

    if (toma.estado !== 'PENDIENTE') {
      throw new ConflictException(
        'Solo se pueden eliminar tomas pendientes. Usa PATCH con estado OMITIDA para cancelar una toma registrada.',
      );
    }

    try {
      await this.prisma.tomas_medicamento.delete({
        where: { id },
        select: SELECT_TOMA,
      });

      return { id, eliminado: true as const };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'La toma tiene notificaciones asociadas y no puede eliminarse.',
        );
      }

      throw error;
    }
  }
}
