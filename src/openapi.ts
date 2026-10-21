import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
