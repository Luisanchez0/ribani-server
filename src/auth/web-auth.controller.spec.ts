import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from './auth.service.js';
import { WebAuthController } from './web-auth.controller.js';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';

describe('WebAuthController HTTP', () => {
  let app: INestApplication;
  const tokens = {
    accessToken: 'access-test',
    refreshToken: 'refresh-test',
    tokenType: 'Bearer',
    expiresIn: 900,
    user: { id: 'user-test' },
  };
  const auth = {
    login: vi.fn(),
    loginWithTwoFactor: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CORS_ORIGINS', 'http://localhost:5173,https://ribani.example');
    vi.clearAllMocks();
    auth.login.mockResolvedValue(tokens);
    auth.loginWithTwoFactor.mockResolvedValue(tokens);
    auth.refresh.mockResolvedValue(tokens);
    auth.logout.mockResolvedValue({ message: 'Sesión cerrada' });
    const module = await Test.createTestingModule({
      controllers: [WebAuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    })
      .overrideGuard(AuthRateLimitGuard)
      .useValue({ canActivate: () => true })
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

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('returns only an access token and stores the refresh token in an HttpOnly cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/web/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: 'test@ribani.test', password: 'password-test' })
      .expect(201);
    expect(response.body.accessToken).toBe(tokens.accessToken);
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie'][0]).toMatch(
      /ribani_refresh=refresh-test;.*Path=\/auth\/web;.*HttpOnly;.*SameSite=Lax/,
    );
    expect(response.headers['set-cookie'][0]).not.toMatch(/; Secure/);
    expect(auth.login.mock.calls[0][1].ip).toBeDefined();
  });

  it('uses a Secure cross-site cookie in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await request(app.getHttpServer())
      .post('/auth/web/login')
      .set('Origin', 'https://ribani.example')
      .send({ email: 'test@ribani.test', password: 'password-test' })
      .expect(201);
    expect(response.headers['set-cookie'][0]).toContain('; Secure');
    expect(response.headers['set-cookie'][0]).toContain('; SameSite=None');
  });

  it.each([undefined, 'https://hostile.example', 'null'])(
    'rejects unapproved Origin %s',
    async (origin) => {
      let call = request(app.getHttpServer()).post('/auth/web/login');
      if (origin) call = call.set('Origin', origin);
      await call
        .send({ email: 'test@ribani.test', password: 'password-test' })
        .expect(403);
      expect(auth.login).not.toHaveBeenCalled();
    },
  );

  it('does not set a session cookie for an incomplete 2FA challenge', async () => {
    auth.login.mockResolvedValueOnce({
      twoFactorRequired: true,
      challengeToken: 'challenge-test',
      expiresIn: 300,
    });
    const response = await request(app.getHttpServer())
      .post('/auth/web/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: 'test@ribani.test', password: 'password-test' })
      .expect(201);
    expect(response.body.twoFactorRequired).toBe(true);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('sets the cookie only after the second login factor is valid', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/web/2fa/login')
      .set('Origin', 'http://localhost:5173')
      .send({ challengeToken: 'challenge-test-1234567890', code: '123456' })
      .expect(201);
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  });

  it('refreshes using only the cookie and rotates it without disclosing it', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/web/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', 'unrelated=x; ribani_refresh=old%2Drefresh')
      .expect(201);
    expect(auth.refresh).toHaveBeenCalledWith(
      { refreshToken: 'old-refresh' },
      expect.any(Object),
    );
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie'][0]).toContain(
      'ribani_refresh=refresh-test;',
    );
  });

  it.each(['', 'ribani_refresh=%ZZ', 'ribani_refresh=a; ribani_refresh=b'])(
    'rejects absent, malformed or ambiguous cookies %s',
    async (cookie) => {
      const call = request(app.getHttpServer())
        .post('/auth/web/refresh')
        .set('Origin', 'http://localhost:5173');
      if (cookie) call.set('Cookie', cookie);
      await call.expect(401);
      expect(auth.refresh).not.toHaveBeenCalled();
    },
  );

  it('revokes and clears the browser cookie on logout', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/web/logout')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', 'ribani_refresh=old-refresh')
      .expect(201);
    expect(auth.logout).toHaveBeenCalledWith(
      { refreshToken: 'old-refresh' },
      expect.any(Object),
    );
    expect(response.headers['set-cookie'][0]).toMatch(
      /ribani_refresh=;.*Path=\/auth\/web;.*Expires=Thu, 01 Jan 1970/,
    );
  });

  it.each(['refresh', 'logout'])(
    'rejects cross-site cookie %s before invoking auth',
    async (route) => {
      await request(app.getHttpServer())
        .post(`/auth/web/${route}`)
        .set('Origin', 'https://hostile.example')
        .set('Cookie', 'ribani_refresh=old-refresh')
        .expect(403);
      expect(auth[route as 'refresh' | 'logout']).not.toHaveBeenCalled();
    },
  );
});
