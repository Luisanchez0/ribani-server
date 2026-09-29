import { Module } from '@nestjs/common';

import { PrismaModule } from './prisma/prisma.module.js';
import { UsuariosModule } from './usuarios/usuario.module.js';

@Module({
  imports: [
    PrismaModule,
    UsuariosModule,
  ],
})
export class AppModule {}