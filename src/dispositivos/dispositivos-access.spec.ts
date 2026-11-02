import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Test } from '@nestjs/testing';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { DispositivosController } from './dispositivos.controller.js';
import { DispositivosService } from './dispositivos.service.js';

const FAMILIAR = '11111111-1111-4111-8111-111111111111';
const ADULTO = '22222222-2222-4222-8222-222222222222';
const AJENO = '33333333-3333-4333-8333-333333333333';
const DISPOSITIVO_ADULTO = '44444444-4444-4444-8444-444444444444';

describe('Lectura de dispositivos de adultos vinculados', () => {
  let app: INestApplication;
  let estado: string;
  let codigo: string;
  const dispositivos = [
    { id: 'propio', usuario_id: FAMILIAR, activo: true },
    { id: DISPOSITIVO_ADULTO, usuario_id: ADULTO, activo: true },
    { id: 'inactivo', usuario_id: ADULTO, activo: false },
    { id: 'ajeno', usuario_id: AJENO, activo: true },
  ].map((row) => ({
    ...row,
    nombre: row.id,
    push_token: 'privado',
    identificador_hash: 'privado',
  }));
  const seleccionar = (
    row: (typeof dispositivos)[number],
    select: Record<string, boolean>,
  ) => Object.fromEntries(Object.entries(row).filter(([key]) => select[key]));
  const prisma = {
    adulto_familiares: {
      findMany: vi.fn(async ({ where }) =>
        where.familiar_id === FAMILIAR && where.estado === estado
          ? [{ adulto_id: ADULTO }]
          : [],
      ),
      findFirst: vi.fn(async ({ where }) =>
        where.familiar_id === FAMILIAR &&
        where.adulto_id === ADULTO &&
        where.estado === estado
          ? { id: 'vinculo' }
          : null,
      ),
    },
    dispositivos: {
      findMany: vi.fn(async ({ where, select }) =>
        dispositivos
          .filter(
            (row) =>
              (!where.usuario_id ||
                (typeof where.usuario_id === 'string'
                  ? row.usuario_id === where.usuario_id
                  : where.usuario_id.in.includes(row.usuario_id))) &&
              (where.activo === undefined || row.activo === where.activo),
          )
          .map((row) => seleccionar(row, select)),
      ),
      findUnique: vi.fn(async ({ where, select }) => {
        const row = dispositivos.find((item) => item.id === where.id);
        return row ? seleccionar(row, select) : null;
      }),
      update: vi.fn(),
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DispositivosController],
      providers: [
        {
          provide: DispositivosService,
          useValue: new DispositivosService(prisma as never),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            id: FAMILIAR,
            rol: { codigo },
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app?.close());
  beforeEach(() => {
    vi.clearAllMocks();
    estado = 'ACTIVA';
    codigo = 'FAMILIAR_ENCARGADO';
  });

  it('lista los dispositivos propios y del adulto con vinculo activo sin exponer secretos', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/dispositivos')
      .expect(200);
    expect(body).toEqual([
      { id: 'propio', usuario_id: FAMILIAR, nombre: 'propio', activo: true },
      {
        id: DISPOSITIVO_ADULTO,
        usuario_id: ADULTO,
        nombre: DISPOSITIVO_ADULTO,
        activo: true,
      },
    ]);
  });

  it('respeta el filtro de adulto y de actividad para el familiar', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/dispositivos?usuarioId=${ADULTO}&soloActivas=false`)
      .expect(200);
    expect(body.map((row: { id: string }) => row.id)).toEqual([
      DISPOSITIVO_ADULTO,
      'inactivo',
    ]);
  });

  it('el filtro de usuario no permite consultar a un adulto ajeno', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/dispositivos?usuarioId=${AJENO}`)
      .expect(200);
    expect(body).toEqual([]);
  });

  it('permite ver el detalle del dispositivo del adulto vinculado', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/dispositivos/${DISPOSITIVO_ADULTO}`)
      .expect(200);
    expect(body).toEqual({
      id: DISPOSITIVO_ADULTO,
      usuario_id: ADULTO,
      nombre: DISPOSITIVO_ADULTO,
      activo: true,
    });
  });

  it.each(['PENDIENTE', 'REVOCADA'])(
    'no permite leer dispositivos con vinculo %s',
    async (value) => {
      estado = value;
      const { body } = await request(app.getHttpServer())
        .get('/dispositivos')
        .expect(200);
      expect(body.map((row: { id: string }) => row.id)).toEqual(['propio']);
      await request(app.getHttpServer())
        .get(`/dispositivos/${DISPOSITIVO_ADULTO}`)
        .expect(404);
    },
  );

  it.each(['patch', 'delete', 'post'] as const)(
    'el acceso de lectura no permite %s sobre el dispositivo del adulto',
    async (method) => {
      const path = `/dispositivos/${DISPOSITIVO_ADULTO}${method === 'post' ? '/latido' : ''}`;
      await request(app.getHttpServer())
        [method](path)
        .send({ nombre: 'Cambio' })
        .expect(404);
      expect(prisma.dispositivos.update).not.toHaveBeenCalled();
    },
  );

  it('conserva el acceso administrativo y su filtro por usuario', async () => {
    codigo = 'ADMINISTRADOR';
    const { body } = await request(app.getHttpServer())
      .get(`/dispositivos?usuarioId=${AJENO}`)
      .expect(200);
    expect(body.map((row: { id: string }) => row.id)).toEqual(['ajeno']);
  });
});
