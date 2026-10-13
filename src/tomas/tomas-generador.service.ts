import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service.js';

const DIAS_SEMANA: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const MINUTOS_DEL_DIA = 1440;
const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 86_400_000;

const ZONA_PRODUCCION = 'America/Mexico_City';

/** Cron diario a las 00:05 hora de CDMX, independiente del TZ del servidor. */
const HORA_CRON = '0 5 0 * * *';
const TZ_CRON = ZONA_PRODUCCION;

@Injectable()
export class TomasGeneradorService {
  readonly logger = new Logger(TomasGeneradorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Corrida principal. Pública para poder dispararse manualmente
   * (tests, scripts o un endpoint futuro).
   */
  async generarTomasDelDia(): Promise<number> {
    const creadas = await this.expandirHorarios();

    if (creadas > 0) {
      this.logger.log(
        `Generadas ${creadas} tomas PENDIENTE desde horarios activos.`,
      );
    }

    return creadas;
  }

  @Cron(HORA_CRON, { timeZone: TZ_CRON })
  protected async cronDiario(): Promise<void> {
    try {
      await this.generarTomasDelDia();
    } catch (error) {
      this.logger.error(
        `Error generando tomas diarias: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }


  private async expandirHorarios(): Promise<number> {
    const medicamentos = await this.prisma.medicamentos.findMany({
      where: { activo: true },
      select: {
        id: true,
        adulto_id: true,
        zona_horaria: true,
        horarios_medicamento: {
          where: { activo: true },
          select: {
            id: true,
            hora_local: true,
            dias_semana: true,
            intervalo_minutos: true,
          },
        },
      },
    });

    if (medicamentos.length === 0) {
      return 0;
    }

    const ahora = new Date();
    const filas: Array<{
      medicamento_id: string;
      horario_id: string;
      adulto_id: string;
      programada_para: Date;
    }> = [];

    for (const medicamento of medicamentos) {
      const zona = medicamento.zona_horaria ?? ZONA_PRODUCCION;
      const horarios = medicamento.horarios_medicamento;

      if (horarios.length === 0) {
        continue;
      }

      for (const offsetDias of [0, 1] as const) {
        const baseMedianoche = this.medianocheEnZona(
          ahora,
          offsetDias,
          zona,
        );
        const diaSemana = this.diaSemanaEnZona(
          new Date(baseMedianoche.getTime() + 12 * MS_POR_MINUTO * 60),
          zona,
        );

        for (const horario of horarios) {
          const deltas = this.deltasDelHorario(horario, diaSemana);

          for (const delta of deltas) {
            const programadaPara = new Date(
              baseMedianoche.getTime() + delta * MS_POR_MINUTO,
            );


            if (
              offsetDias === 0 &&
              programadaPara.getTime() <= ahora.getTime()
            ) {
              continue;
            }

            filas.push({
              medicamento_id: medicamento.id,
              horario_id: horario.id,
              adulto_id: medicamento.adulto_id,
              programada_para: programadaPara,
            });
          }
        }
      }
    }

    if (filas.length === 0) {
      return 0;
    }

    const resultado = await this.prisma.tomas_medicamento.createMany({
      data: filas,
      skipDuplicates: true,
    });

    return resultado.count;
  }


  private deltasDelHorario(
    horario: {
      hora_local: Date;
      dias_semana: number[] | null;
      intervalo_minutos: number | null;
    },
    diaSemanaISO: number,
  ): number[] {
    const dias = horario.dias_semana;
    const diaAplica = !dias || dias.length === 0 || dias.includes(diaSemanaISO);

    const horaMinutos =
      horario.hora_local.getUTCHours() * 60 +
      horario.hora_local.getUTCMinutes();

    const intervalo = horario.intervalo_minutos ?? 0;

    if (intervalo <= 0) {
      return diaAplica ? [horaMinutos] : [];
    }

    if (!diaAplica) {
      return [];
    }

    const deltas: number[] = [];
    for (
      let acumulado = horaMinutos;
      acumulado < MINUTOS_DEL_DIA;
      acumulado += intervalo
    ) {
      deltas.push(acumulado);
    }
    return deltas;
  }

  /** Medianoche (00:00) del día de `ahora + offsetDias` en la zona, en UTC. */
  private medianocheEnZona(
    ahora: Date,
    offsetDias: number,
    zonaHoraria: string,
  ): Date {
    const referencia = new Date(ahora.getTime() + offsetDias * MS_POR_DIA);
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(referencia);

    const obtener = (tipo: string) =>
      partes.find((parte) => parte.type === tipo)?.value ?? '';

    const anio = Number(obtener('year'));
    const mes = Number(obtener('month'));
    const dia = Number(obtener('day'));

    return this.parseZoned(anio, mes, dia, 0, 0, zonaHoraria);
  }

  /** Día de la semana (ISO 1..7) del instante dado, en la zona. */
  private diaSemanaEnZona(fecha: Date, zonaHoraria: string): number {
    const nombre = new Intl.DateTimeFormat('en-US', {
      timeZone: zonaHoraria,
      weekday: 'short',
    }).format(fecha);

    return DIAS_SEMANA[nombre] ?? 0;
  }


  private parseZoned(
    anio: number,
    mes: number,
    dia: number,
    hora: number,
    minuto: number,
    zonaHoraria: string,
  ): Date {
    let guess = Date.UTC(anio, mes - 1, dia, hora, minuto);

    for (let i = 0; i < 3; i++) {
      const offset = this.offsetMinutos(new Date(guess), zonaHoraria);
      const ajustado =
        Date.UTC(anio, mes - 1, dia, hora, minuto) - offset * MS_POR_MINUTO;

      if (ajustado === guess) {
        break;
      }
      guess = ajustado;
    }

    return new Date(guess);
  }

  private offsetMinutos(fecha: Date, zonaHoraria: string): number {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(fecha);

    const obtener = (tipo: string) =>
      partes.find((parte) => parte.type === tipo)?.value ?? '';

    const anio = Number(obtener('year'));
    const mes = Number(obtener('month'));
    const dia = Number(obtener('day'));
    const hora = Number(obtener('hour'));
    const minuto = Number(obtener('minute'));
    const segundo = Number(obtener('second'));

    const comoUTC = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo);
    return Math.round((comoUTC - fecha.getTime()) / MS_POR_MINUTO);
  }
}
