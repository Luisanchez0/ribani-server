import { Module } from '@nestjs/common';

import { MedicamentosModule } from '../medicamentos/medicamentos.module.js';

import { HorariosController } from './horarios.controller.js';
import { HorariosService } from './horarios.service.js';

@Module({
  imports: [MedicamentosModule],
  controllers: [HorariosController],
  providers: [HorariosService],
})
export class HorariosModule {}
