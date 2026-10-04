import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [AuditoriaModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
