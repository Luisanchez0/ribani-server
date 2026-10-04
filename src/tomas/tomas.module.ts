import { Module } from '@nestjs/common';

import { MedicamentosModule } from '../medicamentos/medicamentos.module.js';

import { TomasController } from './tomas.controller.js';
import { TomasService } from './tomas.service.js';

@Module({
  imports: [MedicamentosModule],
  controllers: [TomasController],
  providers: [TomasService],
})
export class TomasModule {}
