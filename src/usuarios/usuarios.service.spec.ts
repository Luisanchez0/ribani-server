import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { UsuariosService } from './usuarios.service.js';

describe('UsuariosService', () => {
  let service: UsuariosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('expone si el 2FA está activo sin filtrar el secreto', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const local = new UsuariosService({
      usuarios: { findMany },
    } as never);

    await local.findAll({});

    const { select } = findMany.mock.calls[0][0];
    expect(select.two_factor_enabled).toBe(true);
    expect(select).not.toHaveProperty('two_factor_secret');
    expect(select).not.toHaveProperty('password_hash');
  });

  it('elimina las notificaciones de alertas y tomas del usuario antes de sus cascadas', async () => {
    const id = '5abae7d5-495d-4931-9e91-d59bb989694c';
    let notificacionesEliminadas = false;
    const deleteMany = vi.fn().mockImplementation(() => {
      notificacionesEliminadas = true;
      return { count: 2 };
    });
    const eliminarUsuario = vi.fn().mockImplementation(() => {
      if (!notificacionesEliminadas)
        throw new Error('wa_notificacion_origen_chk');
      return { id };
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      notificaciones_whatsapp: { deleteMany },
      usuarios: { delete: eliminarUsuario },
    };
    const local = new UsuariosService({
      usuarios: {
        findUnique: vi.fn().mockResolvedValue({ id }),
        delete: eliminarUsuario,
      },
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
    } as never);

    await expect(local.remove(id)).resolves.toEqual({ id });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { alertas: { adulto_id: id } },
          { tomas_medicamento: { adulto_id: id } },
        ],
      },
    });
    expect(eliminarUsuario).toHaveBeenCalledWith({
      where: { id },
      select: { id: true },
    });
    const queries = tx.$queryRaw.mock.calls.map(([parts, value]) => ({
      sql: (parts as TemplateStringsArray)
        .join('?')
        .replace(/\s+/g, ' ')
        .trim(),
      value,
    }));
    expect(queries).toEqual([
      {
        sql: 'SELECT id FROM usuarios WHERE id = ?::uuid FOR UPDATE',
        value: id,
      },
      {
        sql: 'SELECT id FROM alertas WHERE adulto_id = ?::uuid ORDER BY id FOR UPDATE',
        value: id,
      },
      {
        sql: 'SELECT id FROM tomas_medicamento WHERE adulto_id = ?::uuid ORDER BY id FOR UPDATE',
        value: id,
      },
    ]);
    expect(tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      deleteMany.mock.invocationCallOrder[0],
    );
  });

  it('no elimina al usuario si falla la limpieza de sus notificaciones', async () => {
    const eliminarUsuario = vi.fn().mockResolvedValue({ id: 'usuario' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      notificaciones_whatsapp: {
        deleteMany: vi
          .fn()
          .mockRejectedValue(new Error('database unavailable')),
      },
      usuarios: { delete: eliminarUsuario },
    };
    const local = new UsuariosService({
      usuarios: {
        findUnique: vi.fn().mockResolvedValue({ id: 'usuario' }),
        delete: eliminarUsuario,
      },
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
    } as never);

    await expect(local.remove('usuario')).rejects.toThrow(
      'database unavailable',
    );
    expect(eliminarUsuario).not.toHaveBeenCalled();
  });

  it('propaga el fallo de eliminación dentro de la misma transacción que la limpieza', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      notificaciones_whatsapp: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      usuarios: {
        delete: vi.fn().mockRejectedValue(new Error('delete failed')),
      },
    };
    const transaction = vi.fn(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    const local = new UsuariosService({
      usuarios: { findUnique: vi.fn().mockResolvedValue({ id: 'usuario' }) },
      $transaction: transaction,
    } as never);

    await expect(local.remove('usuario')).rejects.toThrow('delete failed');
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.notificaciones_whatsapp.deleteMany).toHaveBeenCalledOnce();
    expect(
      tx.notificaciones_whatsapp.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.usuarios.delete.mock.invocationCallOrder[0]);
  });

  it('espera todos los bloqueos antes de limpiar las notificaciones', async () => {
    let desbloquear!: () => void;
    const bloqueoPendiente = new Promise<void>((resolve) => {
      desbloquear = resolve;
    });
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockReturnValueOnce(bloqueoPendiente),
      notificaciones_whatsapp: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      usuarios: { delete: vi.fn().mockResolvedValue({ id: 'usuario' }) },
    };
    const local = new UsuariosService({
      usuarios: { findUnique: vi.fn().mockResolvedValue({ id: 'usuario' }) },
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
    } as never);

    const eliminacion = local.remove('usuario');
    await vi.waitFor(() => expect(tx.$queryRaw).toHaveBeenCalledTimes(3));
    expect(tx.notificaciones_whatsapp.deleteMany).not.toHaveBeenCalled();
    expect(tx.usuarios.delete).not.toHaveBeenCalled();
    desbloquear();
    await expect(eliminacion).resolves.toEqual({ id: 'usuario' });
  });

  it('no modifica datos si falla un bloqueo de origen', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('lock timeout')),
      notificaciones_whatsapp: { deleteMany: vi.fn() },
      usuarios: { delete: vi.fn() },
    };
    const local = new UsuariosService({
      usuarios: { findUnique: vi.fn().mockResolvedValue({ id: 'usuario' }) },
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
    } as never);

    await expect(local.remove('usuario')).rejects.toThrow('lock timeout');
    expect(tx.notificaciones_whatsapp.deleteMany).not.toHaveBeenCalled();
    expect(tx.usuarios.delete).not.toHaveBeenCalled();
  });
});
