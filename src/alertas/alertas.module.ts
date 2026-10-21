import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module.js';

import { AlertasController } from './alertas.controller.js';
import { AlertasService } from './alertas.service.js';

@Module({
  imports: [WhatsappModule],
  controllers: [AlertasController],
  providers: [AlertasService],
  exports: [AlertasService],
})
export class AlertasModule {}
