import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { SwaggerModule } from '@nestjs/swagger';
import { crearDocumentoOpenApi, swaggerHabilitado } from './openapi.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const production = process.env.NODE_ENV === 'production';
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  // Render termina TLS delante de Nest; no confiar en cabeceras sin proxy configurado.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5)
    throw new Error('TRUST_PROXY_HOPS debe estar entre 0 y 5.');
  if (proxyHops) express.set('trust proxy', proxyHops);
  app.use(
    (
      request: import('express').Request,
      response: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (production) {
        response.setHeader('Strict-Transport-Security', 'max-age=31536000');
        if (!request.secure && request.path !== '/') {
          response
            .status(400)
            .json({
              statusCode: 400,
              message: 'HTTPS es obligatorio en producción.',
            });
          return;
        }
      }
      next();
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS: orígenes del panel web (separados por coma en CORS_ORIGINS).
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);
  if (
    !corsOrigins.length ||
    corsOrigins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          origin !== url.origin ||
          !['http:', 'https:'].includes(url.protocol) ||
          (production && url.protocol !== 'https:')
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      'CORS_ORIGINS debe contener orígenes explícitos válidos (HTTPS en producción).',
    );

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  });

  if (swaggerHabilitado()) {
    SwaggerModule.setup('api', app, crearDocumentoOpenApi(app));
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
