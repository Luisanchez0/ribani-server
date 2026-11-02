import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Swagger describe toda la superficie de la API: en producción solo se publica
 * con una activación explícita. `npm run openapi:export` no depende de esto.
 */
export function swaggerHabilitado(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NODE_ENV !== 'production' || env.SWAGGER_ENABLED === 'true';
}

export function crearDocumentoOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('RIBANI API')
    .setDescription(
      'API del sistema RIBANI — cuidado de adultos mayores que viven solos.\n\n' +
      'Autenticación: JWT Bearer. Haga login en POST /auth/login y use el ' +
      'accessToken en el header "Authorization: Bearer <token>".',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, config);
}
