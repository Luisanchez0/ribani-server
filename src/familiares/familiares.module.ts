import { Module } from '@nestjs/common';

import { FamiliaresController } from './familiares.controller.js';
import { InvitacionesFamiliaresController } from './invitaciones-familiares.controller.js';
import { FamiliaresService } from './familiares.service.js';

@Module({
  controllers: [FamiliaresController, InvitacionesFamiliaresController],
  providers: [FamiliaresService],
})
export class FamiliaresModule {}
