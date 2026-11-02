import { Module } from '@nestjs/common';
import { MetaWhatsappService } from './meta-whatsapp.service.js';
import { EvolutionWhatsappService } from './evolution-whatsapp.service.js';
import {
  WHATSAPP_TRANSPORTE,
  proveedorConfigurado,
} from './whatsapp-transporte.js';
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
    EvolutionWhatsappService,
    {
      provide: WHATSAPP_TRANSPORTE,
      inject: [MetaWhatsappService, EvolutionWhatsappService],
      useFactory: (
        meta: MetaWhatsappService,
        evolution: EvolutionWhatsappService,
      ) => (proveedorConfigurado() === 'EVOLUTION_API' ? evolution : meta),
    },
    WhatsappService,
    WhatsappWorkerService,
    WhatsappWebhookService,
    WhatsappRecordatoriosService,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
