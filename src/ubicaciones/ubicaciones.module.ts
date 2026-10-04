import { Module } from '@nestjs/common';

import { AlertasModule } from '../alertas/alertas.module.js';
import { UbicacionesController } from './ubicaciones.controller.js';
import { UbicacionesService } from './ubicaciones.service.js';

@Module({
  imports: [AlertasModule],
  controllers: [UbicacionesController],
  providers: [UbicacionesService],
})
export class UbicacionesModule {}
