import { Module } from '@nestjs/common';

import { FamiliaresController } from './familiares.controller.js';
import { FamiliaresService } from './familiares.service.js';

@Module({
  controllers: [FamiliaresController],
  providers: [FamiliaresService],
})
export class FamiliaresModule {}
