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
import { Reflector } from '@nestjs/core';
import {
  ValidationPipe,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { MedicamentosService } from '../medicamentos/medicamentos.service.js';
import { TomasController } from './tomas.controller.js';
import { TomasService } from './tomas.service.js';

const ID = '11111111-1111-4111-8111-111111111111';
const MEDICAMENTO = '22222222-2222-4222-8222-222222222222';
const ADULTO = '33333333-3333-4333-8333-333333333333';
const FAMILIAR = '44444444-4444-4444-8444-444444444444';

describe('Permisos HTTP del familiar para registrar y eliminar tomas', () => {
  let app: INestApplication;
  let permisos: string[];
  let estado: string;
  let puedeGestionar: boolean;
  const toma = {
    id: ID,
    medicamento_id: MEDICAMENTO,
    adulto_id: ADULTO,
    horario_id: null,
    estado: 'PENDIENTE',
    programada_para: new Date('2026-10-29T15:00:00Z'),
  };
  const prisma = {
    usuarios: {
      findUnique: vi.fn(async () => ({
        roles: { codigo: 'FAMILIAR_ENCARGADO' },
      })),
    },
    adulto_familiares: {
      findFirst: vi.fn(async ({ where }) =>
        where.adulto_id === ADULTO &&
        where.familiar_id === FAMILIAR &&
        where.estado === estado &&
        where.puede_gestionar_medicamentos === puedeGestionar
          ? { id: 'vinculo' }
          : null,
      ),
    },
    medicamentos: {
      findUnique: vi.fn(async () => ({
        id: MEDICAMENTO,
        adulto_id: ADULTO,
        activo: true,
      })),
    },
    tomas_medicamento: {
      findUnique: vi.fn(async () => toma),
      create: vi.fn(async () => toma),
      update: vi.fn(async () => ({ id: ID })),
    },
    notificaciones_whatsapp: { updateMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  beforeAll(async () => {
    const medicamentos = new MedicamentosService(prisma as never);
    const module = await Test.createTestingModule({
      controllers: [TomasController],
      providers: [
        {
          provide: TomasService,
          useValue: new TomasService(prisma as never, medicamentos),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            id: FAMILIAR,
            rol: { codigo: 'FAMILIAR_ENCARGADO' },
            permisos,
          };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue(new PermissionsGuard(new Reflector()))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app?.close());
  beforeEach(() => {
    vi.clearAllMocks();
    permisos = ['tomas.leer', 'tomas.actualizar'];
    estado = 'ACTIVA';
    puedeGestionar = true;
  });

  function ejecutar(method: 'post' | 'delete') {
    return method === 'post'
      ? request(app.getHttpServer())
          .post('/tomas')
          .send({
            medicamento_id: MEDICAMENTO,
            programada_para: '2026-10-29T15:00:00Z',
          })
      : request(app.getHttpServer()).delete(`/tomas/${ID}`);
  }

  it('registra una toma del adulto con el permiso vigente y vinculo autorizado', async () => {
    const { body } = await ejecutar('post').expect(201);
    expect(body).toMatchObject({ id: ID, adulto_id: ADULTO });
  });

  it('elimina del historial del adulto con el permiso vigente y vinculo autorizado', async () => {
    const { body } = await ejecutar('delete').expect(200);
    expect(body).toEqual({ id: ID, eliminado: true });
  });

  it.each(['post', 'delete'] as const)(
    'rechaza %s si el rol solo tiene tomas.leer',
    async (method) => {
      permisos = ['tomas.leer'];
      await ejecutar(method).expect(403);
      expect(prisma.tomas_medicamento.create).not.toHaveBeenCalled();
      expect(prisma.tomas_medicamento.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['post', 'REVOCADA', true],
    ['delete', 'REVOCADA', true],
    ['post', 'ACTIVA', false],
    ['delete', 'ACTIVA', false],
  ] as const)(
    'rechaza %s con vinculo %s y gestion %s aun con permiso global',
    async (method, linkEstado, gestion) => {
      estado = linkEstado;
      puedeGestionar = gestion;
      await ejecutar(method).expect(403);
      expect(prisma.tomas_medicamento.create).not.toHaveBeenCalled();
      expect(prisma.tomas_medicamento.update).not.toHaveBeenCalled();
    },
  );
});
