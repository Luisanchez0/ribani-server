import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module.js';
import { UsuariosModule } from './usuarios/usuario.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ContactosModule } from './contactos/contactos.module.js';
import { MedicamentosModule } from './medicamentos/medicamentos.module.js';
import { HorariosModule } from './horarios/horarios.module.js';
import { TomasModule } from './tomas/tomas.module.js';
import { FamiliaresModule } from './familiares/familiares.module.js';
import { ZonasSegurasModule } from './zonas-seguras/zonas-seguras.module.js';
import { UbicacionesModule } from './ubicaciones/ubicaciones.module.js';
import { AlertasModule } from './alertas/alertas.module.js';
import { DispositivosModule } from './dispositivos/dispositivos.module.js';
import { RolesModule } from './roles/roles.module.js';
import { AuditoriaModule } from './auditoria/auditoria.module.js';
import { AUDITORIA_INTERCEPTOR } from './auditoria/auditoria.interceptor.js';
import { AuthorizationModule } from './authorization/authorization.module.js';


@Module({
  imports: [
    PrismaModule,
    UsuariosModule,
    AuthModule,
    AuthorizationModule,
    ContactosModule,
    MedicamentosModule,
    HorariosModule,
    TomasModule,
    FamiliaresModule,
    ZonasSegurasModule,
    UbicacionesModule,
    AlertasModule,
    DispositivosModule,
    RolesModule,
    AuditoriaModule
  ],
  providers: [AUDITORIA_INTERCEPTOR],
})
export class AppModule {}