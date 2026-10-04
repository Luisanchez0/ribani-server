import { Module } from '@nestjs/common';

import { DispositivosController } from './dispositivos.controller.js';
import { DispositivosService } from './dispositivos.service.js';

@Module({
  controllers: [DispositivosController],
  providers: [DispositivosService],
})
export class DispositivosModule {}
