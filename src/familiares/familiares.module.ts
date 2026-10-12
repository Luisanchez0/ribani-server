import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module.js';
import { FamiliaresController } from './familiares.controller.js';
import { InvitacionesFamiliaresController } from './invitaciones-familiares.controller.js';
import { FamiliaresService } from './familiares.service.js';

@Module({
  imports: [MailModule],
  controllers: [FamiliaresController, InvitacionesFamiliaresController],
  providers: [FamiliaresService],
})
export class FamiliaresModule {}
