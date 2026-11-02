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
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ValidationPipe,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { MedicamentosController } from '../medicamentos/medicamentos.controller.js';
import { MedicamentosService } from '../medicamentos/medicamentos.service.js';
import {
  HorariosController,
  HorariosListaController,
} from '../horarios/horarios.controller.js';
import { HorariosService } from '../horarios/horarios.service.js';
import { TomasController } from '../tomas/tomas.controller.js';
import { TomasService } from '../tomas/tomas.service.js';
import { ContactosController } from '../contactos/contactos.controller.js';
import { ContactosService } from '../contactos/contactos.service.js';
import { DispositivosController } from '../dispositivos/dispositivos.controller.js';
import { DispositivosService } from '../dispositivos/dispositivos.service.js';
import { ZonasSegurasController } from '../zonas-seguras/zonas-seguras.controller.js';
import { ZonasSegurasService } from '../zonas-seguras/zonas-seguras.service.js';
import { UbicacionesController } from '../ubicaciones/ubicaciones.controller.js';
import { UbicacionesService } from '../ubicaciones/ubicaciones.service.js';
import { AlertasController } from '../alertas/alertas.controller.js';
import { AlertasService } from '../alertas/alertas.service.js';
import { AuditoriaController } from '../auditoria/auditoria.controller.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { FamiliaresController } from '../familiares/familiares.controller.js';
import { AuthAttemptsService } from '../auth/auth-attempts.service.js';
import { FamiliaresService } from '../familiares/familiares.service.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ALL_PERMISSIONS = [
  'alertas.leer',
  'auditoria.leer',
  'medicamentos.leer',
  'medicamentos.crear',
  'medicamentos.actualizar',
  'tomas.leer',
  'tomas.actualizar',
  'ubicaciones.leer',
  'relaciones.leer',
];

describe('Filtros HTTP de los dominios', () => {
  let app: INestApplication;
  let permisos = ALL_PERMISSIONS;
  let role = 'ADULTO_MAYOR';
  const read = vi.fn().mockResolvedValue([]);
  const prisma = {
    usuarios: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ roles: { codigo: 'ADULTO_MAYOR' } }),
    },
    adulto_familiares: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 'vinculo' }),
    },
    medicamentos: {
      findMany: read,
      findUnique: vi.fn().mockResolvedValue({ id: ID, adulto_id: ID }),
    },
    horarios_medicamento: { findMany: read },
    tomas_medicamento: { findMany: read },
    contactos_emergencia: { findMany: read },
    dispositivos: { findMany: read },
    zonas_seguras: { findMany: read },
    ubicaciones: { findMany: read },
    alertas: { findMany: read },
    auditoria: { findMany: read },
  };
  beforeAll(async () => {
    const medicamentos = new MedicamentosService(prisma as never);
    const alertas = new AlertasService(prisma as never, {} as never);
    const module = await Test.createTestingModule({
      controllers: [
        MedicamentosController,
        HorariosController,
        HorariosListaController,
        TomasController,
        ContactosController,
        DispositivosController,
        ZonasSegurasController,
        UbicacionesController,
        AlertasController,
        AuditoriaController,
        FamiliaresController,
      ],
      providers: [
        { provide: MedicamentosService, useValue: medicamentos },
        {
          provide: HorariosService,
          useValue: new HorariosService(prisma as never, medicamentos),
        },
        {
          provide: TomasService,
          useValue: new TomasService(prisma as never, medicamentos),
        },
        {
          provide: ContactosService,
          useValue: new ContactosService(prisma as never),
        },
        {
          provide: DispositivosService,
          useValue: new DispositivosService(prisma as never),
        },
        {
          provide: ZonasSegurasService,
          useValue: new ZonasSegurasService(prisma as never),
        },
        {
          provide: UbicacionesService,
          useValue: new UbicacionesService(prisma as never, alertas),
        },
        { provide: AlertasService, useValue: alertas },
        {
          provide: AuditoriaService,
          useValue: new AuditoriaService(prisma as never),
        },
        {
          provide: FamiliaresService,
          useValue: new FamiliaresService(
            prisma as never,
            {} as never,
            new AuthAttemptsService(),
          ),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            id: ID,
            rol: { codigo: role },
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
    permisos = ALL_PERMISSIONS;
    role = 'ADULTO_MAYOR';
  });

  it.each([
    '/medicamentos',
    '/horarios',
    '/tomas',
    `/ubicaciones/historial?adultoId=${ID}`,
  ])(
    'impide leer %s sin el permiso del dominio incluso siendo administrador',
    async (path) => {
      permisos = [];
      role = 'ADMINISTRADOR';
      await request(app.getHttpServer()).get(path).expect(403);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['post', '/medicamentos'],
    ['patch', `/medicamentos/${ID}`],
    ['delete', `/medicamentos/${ID}`],
    ['post', `/medicamentos/${ID}/horarios`],
    ['patch', `/medicamentos/${ID}/horarios/${ID}`],
    ['delete', `/medicamentos/${ID}/horarios/${ID}`],
    ['post', '/tomas'],
    ['patch', `/tomas/${ID}`],
    ['delete', `/tomas/${ID}`],
    ['post', `/tomas/${ID}/posponer`],
  ] as const)(
    'impide %s %s cuando el rol solo tiene lectura',
    async (method, path) => {
      permisos = ['medicamentos.leer', 'tomas.leer'];
      await request(app.getHttpServer())[method](path).send({}).expect(403);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('evalúa los permisos vigentes en cada solicitud', async () => {
    permisos = ['medicamentos.leer'];
    await request(app.getHttpServer()).get('/medicamentos').expect(200);
    permisos = [];
    await request(app.getHttpServer()).get('/medicamentos').expect(403);
  });

  it.each([
    '/medicamentos?adultoId=incorrecto',
    '/medicamentos?soloActivos=0',
    '/horarios?medicamentoId=incorrecto',
    '/horarios?adultoId=',
    '/horarios?soloActivos=yes',
    `/medicamentos/${ID}/horarios?soloActivos=yes`,
    '/tomas?adultoId=incorrecto',
    '/tomas?medicamentoId=incorrecto',
    '/tomas?desde=ayer',
    '/tomas?desde=2026-10-25&hasta=2026-10-24',
    '/contactos?soloActivos=1',
    '/dispositivos?usuarioId=incorrecto',
    '/dispositivos?soloActivas=FALSE',
    '/zonas-seguras?adultoId=incorrecto',
    '/zonas-seguras?soloActivas=no',
    '/alertas?adultoId=incorrecto',
    '/alertas?limite=NaN',
    '/alertas?limite=Infinity',
    '/alertas?limite=1.5',
    '/alertas?limite=0',
    '/alertas?limite=501',
    '/alertas?limite=',
    `/ubicaciones/historial?adultoId=${ID}&limite=abc`,
    `/ubicaciones/historial?adultoId=${ID}&desde=2026-02-30`,
    `/ubicaciones/historial?adultoId=${ID}&desde=2026-10-25&hasta=2026-10-24`,
    '/auditoria?limite=Infinity',
    '/auditoria?limite=201',
    '/auditoria?limite=2.5',
    '/auditoria?desde=2026-10-25&hasta=2026-10-24',
    '/medicamentos?soloActivos=true&soloActivos=false',
    '/familiares?limite=Infinity',
    '/familiares/mis-adultos?limite=501',
    '/familiares/mis-familiares?limite=1.5',
  ])('rechaza %s antes de consultar datos', async (path) => {
    await request(app.getHttpServer()).get(path).expect(400);
    expect(read).not.toHaveBeenCalled();
  });

  it('conserva filtros válidos y acota los listados de tomas', async () => {
    await request(app.getHttpServer())
      .get(`/tomas?adultoId=${ID}&limite=25`)
      .expect(200);
    expect(read.mock.calls[0][0]).toMatchObject({
      take: 25,
      where: { adulto_id: { in: [ID] } },
    });
  });

  it('acota el listado de vínculos sin perder el filtro de identidad', async () => {
    await request(app.getHttpServer()).get('/familiares?limite=25').expect(200);
    expect(prisma.adulto_familiares.findMany.mock.calls[0][0]).toMatchObject({
      take: 25,
      where: { OR: [{ adulto_id: ID }, { familiar_id: ID }] },
    });
  });

  it('publica los filtros y límites validados en el contrato OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(document.paths['/medicamentos'].get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'adultoId',
          in: 'query',
          schema: expect.objectContaining({ format: 'uuid' }),
        }),
        expect.objectContaining({
          name: 'soloActivos',
          in: 'query',
          schema: expect.objectContaining({ type: 'boolean' }),
        }),
        expect.objectContaining({
          name: 'limite',
          in: 'query',
          schema: expect.objectContaining({ type: 'integer', maximum: 500 }),
        }),
      ]),
    );
  });
});
