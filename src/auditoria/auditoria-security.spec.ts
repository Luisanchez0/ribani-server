import { describe, it, expect, vi } from 'vitest';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuditoriaService } from './auditoria.service.js';
import { AuditoriaInterceptor } from './auditoria.interceptor.js';

const context = {
  getType: () => 'http',
  switchToHttp: () => ({
    getRequest: () => ({
      method: 'PATCH',
      url: '/roles/1',
      route: { path: '/roles/:id' },
      params: { id: '1' },
      headers: { 'user-agent': 'browser' },
      ip: '127.0.0.1',
      user: { id: 'actor' },
      body: { password: 'never-log-me' },
    }),
  }),
};
describe('Trazabilidad de auditoría', () => {
  it('no oculta un fallo al persistir el registro', async () => {
    const service = new AuditoriaService({
      auditoria: {
        create: vi.fn().mockRejectedValue(new Error('db unavailable')),
      },
    } as never);
    await expect(
      service.registrar({ accion: 'CAMBIO', entidad: 'roles' }),
    ).rejects.toThrow();
  });
  it('espera la persistencia antes de devolver una operación administrativa', async () => {
    let complete!: () => void;
    const audit = {
      registrar: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve;
          }),
      ),
    };
    const interceptor = new AuditoriaInterceptor(audit as never);
    let delivered = false;
    const result = lastValueFrom(
      interceptor.intercept(context as never, {
        handle: () => of({ ok: true }),
      }),
    ).then(() => {
      delivered = true;
    });
    await Promise.resolve();
    expect(delivered).toBe(false);
    complete();
    await result;
    expect(audit.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor',
        accion: 'PATCH /roles/:id',
        ip: '127.0.0.1',
      }),
    );
    expect(JSON.stringify(audit.registrar.mock.calls)).not.toContain(
      'never-log-me',
    );
  });
  it('registra operaciones fallidas sin cambiar el error original', async () => {
    const audit = { registrar: vi.fn().mockResolvedValue(undefined) };
    const error = new Error('operation failed');
    const interceptor = new AuditoriaInterceptor(audit as never);
    await expect(
      lastValueFrom(
        interceptor.intercept(context as never, {
          handle: () => throwError(() => error),
        }),
      ),
    ).rejects.toBe(error);
    expect(audit.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'PATCH /roles/:id ERROR' }),
    );
  });
});
