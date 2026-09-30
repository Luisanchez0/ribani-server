import { Module } from '@nestjs/common';

import { PrismaModule } from './prisma/prisma.module.js';
import { UsuariosModule } from './usuarios/usuario.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    PrismaModule,
    UsuariosModule,
    AuthModule,
  ],
})
export class AppModule {}