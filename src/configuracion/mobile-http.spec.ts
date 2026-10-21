import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { ConfiguracionController } from './configuracion.controller.js';
import { ConfiguracionService } from './configuracion.service.js';
import { TomasController } from '../tomas/tomas.controller.js';
import { TomasService } from '../tomas/tomas.service.js';
describe('Contratos móviles y validación HTTP', () => {
  let app: INestApplication;
  const config = {
    actualizar: vi.fn().mockResolvedValue({ adulto_id: 'propio' }),
    obtener: vi.fn().mockResolvedValue({ adulto_id: 'propio' }),
  };
  const tomas = {
    posponer: vi.fn().mockResolvedValue({ estado: 'POSPUESTA' }),
  };
  beforeAll(async () => {
    const m = await Test.createTestingModule({
      controllers: [ConfiguracionController, TomasController],
      providers: [
        { provide: ConfiguracionService, useValue: config },
        { provide: TomasService, useValue: tomas },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(c: ExecutionContext) {
          c.switchToHttp().getRequest<{ user?: unknown }>().user = {
            id: 'propio',
          };
          return true;
        },
      })
      .compile();
    app = m.createNestApplication();
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
  it('no admite sustituir adulto_id ni modificar campos ajenos a los ajustes', async () => {
    await request(app.getHttpServer())
      .patch('/configuracion')
      .send({ adulto_id: 'otro', recordatorio_medicamentos: false })
      .expect(400);
    expect(config.actualizar).not.toHaveBeenCalled();
  });
  it('respeta los límites SQL de repeticiones', async () => {
    await request(app.getHttpServer())
      .patch('/configuracion')
      .send({ max_repeticiones: 13 })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/configuracion')
      .send({ minutos_repeticion: 0 })
      .expect(400);
  });
  it('usa la identidad autenticada al guardar', async () => {
    await request(app.getHttpServer())
      .patch('/configuracion')
      .send({ recordatorio_medicamentos: false })
      .expect(200);
    expect(config.actualizar).toHaveBeenCalledWith(
      'propio',
      expect.objectContaining({ recordatorio_medicamentos: false }),
    );
  });
  it('valida el UUID antes de posponer', async () => {
    await request(app.getHttpServer())
      .post('/tomas/invalido/posponer')
      .expect(400);
    expect(tomas.posponer).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/tomas/11111111-1111-4111-8111-111111111111/posponer')
      .expect(201);
    expect(tomas.posponer).toHaveBeenCalledWith(
      'propio',
      '11111111-1111-4111-8111-111111111111',
    );
  });
});
