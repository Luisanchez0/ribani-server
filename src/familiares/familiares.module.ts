import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { FamiliaresController } from './familiares.controller.js';
import { InvitacionesFamiliaresController } from './invitaciones-familiares.controller.js';
import { FamiliaresService } from './familiares.service.js';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [FamiliaresController, InvitacionesFamiliaresController],
  providers: [FamiliaresService],
})
export class FamiliaresModule {}
