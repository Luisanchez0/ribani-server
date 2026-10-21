import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { crearDocumentoOpenApi } from './openapi.js';

// No se llama a init/listen: no conecta Prisma ni inicia cron o un puerto HTTP.
const app = await NestFactory.create(AppModule, { logger: false });
try {
  await writeFile('openapi.json', JSON.stringify(crearDocumentoOpenApi(app), null, 2) + '\n');
} finally {
  await app.close();
}
