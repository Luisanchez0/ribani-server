import { describe, it, expect, vi, afterEach } from 'vitest';
import { firstValueFrom, Subject } from 'rxjs';
import { sessionStream } from './session-stream.js';
const identity = {
  id: 'user',
  sessionId: 'session',
  accessExpiresAt: Date.now() + 60_000,
};
afterEach(() => vi.useRealTimers());
describe('Revocación de canales SSE', () => {
  it('no entrega datos cuando la sesión o permiso ya fue revocado', async () => {
    const source = new Subject<string>();
    const db = { usuarios: { findFirst: vi.fn().mockResolvedValue(null) } };
    const promise = firstValueFrom(
      sessionStream(
        source,
        db as never,
        identity,
        'ubicaciones.leer',
        async () => {},
      ),
    );
    source.next('private-location');
    await expect(promise).rejects.toThrow();
  });
  it('vuelve a comprobar el vínculo antes de entregar cada evento', async () => {
    const source = new Subject<string>();
    const db = {
      usuarios: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ roles: { codigo: 'FAMILIAR_ENCARGADO' } }),
      },
    };
    const promise = firstValueFrom(
      sessionStream(
        source,
        db as never,
        identity,
        'ubicaciones.leer',
        async () => {
          throw new Error('vinculo revocado');
        },
      ),
    );
    source.next('private-location');
    await expect(promise).rejects.toThrow('vinculo revocado');
  });
  it('cierra un canal inactivo al expirar el access token', async () => {
    vi.useFakeTimers();
    const db = {
      usuarios: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ roles: { codigo: 'ADULTO_MAYOR' } }),
      },
    };
    const promise = firstValueFrom(
      sessionStream(
        new Subject<string>(),
        db as never,
        { ...identity, accessExpiresAt: Date.now() + 1000 },
        'alertas.leer',
        async () => {},
      ),
    );
    const rejected = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1001);
    await rejected;
  });
});
