import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { WhatsappController } from './whatsapp.controller.js';
import { WhatsappWebhookController } from './whatsapp-webhook.controller.js';
import { WhatsappWebhookService } from './whatsapp-webhook.service.js';
import { WhatsappService } from './whatsapp.service.js';
import { crearDocumentoOpenApi } from '../openapi.js';

describe('HTTP WhatsApp: DTOs, guards y bytes de webhook', () => {
  let app: INestApplication;
  const service = { listar: vi.fn().mockResolvedValue([]), registrar: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WhatsappController, WhatsappWebhookController],
      providers: [
        { provide: WhatsappService, useValue: service },
        {
          provide: WhatsappWebhookService,
          useValue: new WhatsappWebhookService({} as PrismaService),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context
            .switchToHttp()
            .getRequest<{ headers: Record<string, unknown>; user?: unknown }>();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user = {
            id: '11111111-1111-4111-8111-111111111111',
            rol: { codigo: 'FAMILIAR_ENCARGADO' },
            permisos: [],
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  afterEach(() => vi.unstubAllEnvs());
  it('protege los destinatarios mediante el guard de sesión', async () => {
    await request(app.getHttpServer())
      .get('/whatsapp/destinatarios')
      .expect(401);
  });
  it('rechaza teléfono inválido y aceptación de consentimiento inyectada en el alta', async () => {
    await request(app.getHttpServer())
      .post('/whatsapp/destinatarios')
      .set('Authorization', 'test')
      .send({ telefono_e164: '5512345678' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/whatsapp/destinatarios')
      .set('Authorization', 'test')
      .send({ telefono_e164: '+525512345678', consentimiento: 'ACEPTADO' })
      .expect(400);
    expect(service.registrar).not.toHaveBeenCalled();
  });
  it('rechaza identificadores inválidos y límites SQL fuera de rango', async () => {
    await request(app.getHttpServer())
      .patch('/whatsapp/destinatarios/invalido/consentimiento')
      .set('Authorization', 'test')
      .send({ aceptado: true })
      .expect(400);
    await request(app.getHttpServer())
      .patch(
        '/whatsapp/adultos/11111111-1111-4111-8111-111111111111/preferencias',
      )
      .set('Authorization', 'test')
      .send({ max_repeticiones: 13 })
      .expect(400);
  });
  it('documenta respuestas generables sin secretos ni parámetros internos', () => {
    const doc = crearDocumentoOpenApi(app);
    expect(
      doc.paths['/whatsapp/historial'].get?.responses['200'],
    ).toBeDefined();
    expect(doc.components?.schemas?.DestinatarioWhatsappDto).toBeDefined();
    expect(doc.paths).not.toHaveProperty('/webhooks/whatsapp');
    const schemas = JSON.stringify(doc.components?.schemas);
    expect(schemas).not.toContain('WHATSAPP_ACCESS_TOKEN');
  });
  it('recibe callbacks sin JWT pero exige firma y preserva los bytes originales', async () => {
    vi.stubEnv('META_APP_SECRET', 'secret');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123');
    const raw = '{ "object": "whatsapp_business_account", "entry": [] }';
    const signature =
      'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(403);
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(raw)
      .expect(200, { recibido: true });
  });
});
