import { afterEach, describe, expect, it, vi } from 'vitest';
import { TomasService } from './tomas.service.js';

afterEach(() => vi.useRealTimers());
function preparar(estado = 'PENDIENTE', minutosTranscurridos = 0) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T14:00:00Z'));
  const toma = {
    id: 't',
    medicamento_id: 'm',
    adulto_id: 'a',
    horario_id: 'h',
    estado,
    programada_para: new Date(Date.now() - minutosTranscurridos * 60_000),
    updated_at: new Date(),
  };
  const prisma = {
    tomas_medicamento: {
      findUnique: vi.fn().mockResolvedValue(toma),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    horarios_medicamento: {
      findUnique: vi.fn().mockResolvedValue({ ventana_minutos: 60 }),
    },
  };
  prisma.tomas_medicamento.updateMany.mockImplementation(async ({ data }) => {
    Object.assign(toma, data);
    return { count: 1 };
  });
  const medicamentos = {
    findOne: vi.fn().mockResolvedValue({ id: 'm', activo: true, dosis: 1 }),
  };
  return {
    prisma,
    toma,
    service: new TomasService(prisma as never, medicamentos as never),
  };
}
describe('Posponer de forma persistente', () => {
  it('pospone diez minutos sin cambiar hora original ni crear otra toma', async () => {
    const { service, prisma, toma } = preparar();
    const original = toma.programada_para;
    const r = await service.posponer('a', 't');
    expect(r.estado).toBe('POSPUESTA');
    expect(r.recordar_en).toEqual(new Date(Date.now() + 600_000));
    expect(toma.programada_para).toEqual(original);
    expect(prisma.tomas_medicamento.updateMany).toHaveBeenCalledOnce();
  });
  it.each(['POSPUESTA', 'TOMADA', 'OMITIDA'])(
    'no vuelve a posponer %s',
    async (estado) => {
      const s = preparar(estado);
      await expect(s.service.posponer('a', 't')).rejects.toThrow();
      expect(s.prisma.tomas_medicamento.updateMany).not.toHaveBeenCalled();
    },
  );
  it('rechaza aplazamientos fuera de la ventana original', async () => {
    const s = preparar('PENDIENTE', 55);
    await expect(s.service.posponer('a', 't')).rejects.toThrow();
  });
  it('rechaza la carrera si otra solicitud ya registró la toma', async () => {
    const s = preparar();
    s.prisma.tomas_medicamento.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.service.posponer('a', 't')).rejects.toThrow();
  });
  it('permite registrar una toma pospuesta dentro de su ventana original', async () => {
    const s = preparar('POSPUESTA', 20);
    expect(
      (await s.service.update('a', 't', { estado: 'TOMADA' })).estado,
    ).toBe('TOMADA');
  });
  it('posponer no amplía la ventana para registrar TOMADA', async () => {
    const s = preparar('POSPUESTA', 65);
    await expect(
      s.service.update('a', 't', { estado: 'TOMADA' }),
    ).rejects.toThrow('ventana');
    expect(s.prisma.tomas_medicamento.updateMany).not.toHaveBeenCalled();
  });
});
