import { Module } from '@nestjs/common';

import { ZonasSegurasController } from './zonas-seguras.controller.js';
import { ZonasSegurasService } from './zonas-seguras.service.js';

@Module({
  controllers: [ZonasSegurasController],
  providers: [ZonasSegurasService],
})
export class ZonasSegurasModule {}
