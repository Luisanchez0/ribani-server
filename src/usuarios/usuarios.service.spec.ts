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
});
