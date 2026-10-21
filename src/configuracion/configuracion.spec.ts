import { describe, expect, it, vi } from 'vitest';
import { ConfiguracionService } from './configuracion.service.js';
describe('Configuración móvil propia', () => {
  function preparar(rol = 'ADULTO_MAYOR') {
    const prisma = {
      usuarios: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ activo: true, roles: { codigo: rol } }),
      },
      configuracion_adulto: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      adulto_familiares: { count: vi.fn().mockResolvedValue(2) },
    };
    return { prisma, service: new ConfiguracionService(prisma as never) };
  }
  it('entrega defaults sin escribir y cuenta únicamente vínculos activos', async () => {
    const { prisma, service } = preparar();
    expect(await service.obtener('adulto')).toMatchObject({
      adulto_id: 'adulto',
      familiares_activos: 2,
      recordatorio_medicamentos: true,
    });
    expect(prisma.adulto_familiares.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          adulto_id: 'adulto',
          estado: 'ACTIVA',
        }),
      }),
    );
    expect(prisma.configuracion_adulto.upsert).not.toHaveBeenCalled();
  });
  it('un familiar no modifica configuración de otra cuenta', async () => {
    const { service, prisma } = preparar('FAMILIAR_ENCARGADO');
    await expect(
      service.actualizar('familiar', { recordatorio_medicamentos: false }),
    ).rejects.toThrow();
    expect(prisma.configuracion_adulto.upsert).not.toHaveBeenCalled();
  });
  it('rechaza una zona horaria inexistente', async () => {
    const { service, prisma } = preparar();
    await expect(
      service.actualizar('adulto', { zona_horaria: 'invalida' }),
    ).rejects.toThrow();
    expect(prisma.configuracion_adulto.upsert).not.toHaveBeenCalled();
  });
  it('guarda solo preferencias de la identidad autenticada', async () => {
    const { service, prisma } = preparar();
    await service.actualizar('adulto', { recordatorio_medicamentos: false });
    expect(prisma.configuracion_adulto.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { adulto_id: 'adulto' },
        update: expect.objectContaining({ recordatorio_medicamentos: false }),
      }),
    );
  });
});
