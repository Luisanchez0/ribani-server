import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ParseUUIDPipe } from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';

import { AuditoriaService } from './auditoria.service.js';

@ApiTags('auditoria')
@ApiBearerAuth()
@Controller('auditoria')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  /**
   * Bitacora de acciones (quien, que, cuando, desde donde).
   * Filtros: ?actorId= &entidad= &entidadId= &accion= &desde= &hasta= &limite=
   */
  @Get()
  @RequirePermissions('auditoria.leer')
  listar(
    @Query('actorId', new ParseUUIDPipe({ optional: true })) actorId?: string,
    @Query('entidad') entidad?: string,
    @Query('entidadId') entidadId?: string,
    @Query('accion') accion?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limite') limite?: string,
  ) {
    return this.auditoriaService.listar({
      actorId,
      entidad,
      entidadId,
      accion,
      desde,
      hasta,
      limite: limite ? Number(limite) : undefined,
    });
  }
}
