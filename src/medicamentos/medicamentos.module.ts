import { Module } from '@nestjs/common';

import { MedicamentosController } from './medicamentos.controller.js';
import { MedicamentosService } from './medicamentos.service.js';

@Module({
  controllers: [MedicamentosController],
  providers: [MedicamentosService],
  exports: [MedicamentosService],
})
export class MedicamentosModule {}
