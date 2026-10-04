import { Module } from '@nestjs/common';

import { ContactosController } from './contactos.controller.js';
import { ContactosService } from './contactos.service.js';

@Module({
  controllers: [ContactosController],
  providers: [ContactosService],
  exports: [ContactosService],
})
export class ContactosModule {}
