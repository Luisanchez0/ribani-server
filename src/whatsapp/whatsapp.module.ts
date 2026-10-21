import { Module } from '@nestjs/common';
import { MetaWhatsappService } from './meta-whatsapp.service.js';
import { WhatsappService } from './whatsapp.service.js';
import { WhatsappController } from './whatsapp.controller.js';
import { WhatsappWorkerService } from './whatsapp-worker.service.js';
import { WhatsappWebhookService } from './whatsapp-webhook.service.js';
import { WhatsappWebhookController } from './whatsapp-webhook.controller.js';
import { WhatsappRecordatoriosService } from './whatsapp-recordatorios.service.js';

@Module({
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [
    MetaWhatsappService,
    WhatsappService,
    WhatsappWorkerService,
    WhatsappWebhookService,
    WhatsappRecordatoriosService,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
