import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { WhatsappWebhookService } from './whatsapp-webhook.service.js';

@ApiExcludeController()
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(private readonly webhook: WhatsappWebhookService) {}
  @Get()
  verificar(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    return this.webhook.verificar(mode, token, challenge);
  }
  @Post()
  @HttpCode(200)
  recibir(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') firma?: string,
  ) {
    return this.webhook.recibir(req.rawBody, firma, req.body as unknown);
  }
}
