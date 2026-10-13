import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { MedicamentosModule } from '../medicamentos/medicamentos.module.js';

import { TomasController } from './tomas.controller.js';
import { TomasService } from './tomas.service.js';
import { TomasGeneradorService } from './tomas-generador.service.js';

@Module({
  imports: [MedicamentosModule, ScheduleModule.forRoot()],
  controllers: [TomasController],
  providers: [TomasService, TomasGeneradorService],
})
export class TomasModule {}
