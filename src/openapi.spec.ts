import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject, SchemaObject } from '@nestjs/swagger';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { UsuariosController } from './usuarios/usuarios.controller.js';
import { UsuariosService } from './usuarios/usuarios.service.js';
import { crearDocumentoOpenApi } from './openapi.js';

describe('Contrato OpenAPI de autenticación y perfil', () => {
  let app: INestApplication;
  let documento: OpenAPIObject;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, UsuariosController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: UsuariosService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    documento = crearDocumentoOpenApi(app);
  });
  afterAll(async () => { await app?.close(); });

  it('publica las rutas reales de perfil y contraseña', () => {
    expect(documento.paths['/usuarios/perfil'].get).toBeDefined();
    expect(documento.paths['/usuarios/perfil'].patch).toBeDefined();
    expect(documento.paths['/usuarios/perfil/password'].patch).toBeDefined();
    const body = documento.components?.schemas?.UpdatePerfilDto as SchemaObject;
    expect(Object.keys(body.properties ?? {})).toEqual(expect.arrayContaining(['nombre', 'apellido', 'telefono']));
  });

  it('expresa las dos variantes de login y los tokens del refresh', () => {
    const respuesta = documento.paths['/auth/login'].post?.responses['201'];
    expect(respuesta).toMatchObject({ content: { 'application/json': { schema: {
      oneOf: [
        { $ref: '#/components/schemas/TokensRespuestaDto' },
        { $ref: '#/components/schemas/DesafioDosPasosDto' },
      ],
    } } } });
    expect(documento.paths['/auth/refresh'].post?.responses['201']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/TokensRespuestaDto' } } },
    });
  });

  it('no incorpora secretos ni hashes en las respuestas de usuario', () => {
    for (const nombre of ['UsuarioRespuestaDto', 'UsuarioSesionDto']) {
      const schema = documento.components?.schemas?.[nombre] as SchemaObject;
      expect(schema).toBeDefined();
      expect(Object.keys(schema.properties ?? {})).not.toEqual(expect.arrayContaining(['password_hash']));
      expect(schema.properties).not.toHaveProperty('two_factor_secret');
      expect(schema.properties).not.toHaveProperty('password');
    }
  });
});
