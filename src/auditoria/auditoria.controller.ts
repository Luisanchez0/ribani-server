import { ApiListQuery, ListQueryPipe, type ListQuery } from '../common/pipes/list-query.pipe.js';
import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';

import { EventoAuditoriaRespuestaDto } from './dto/evento-auditoria-respuesta.dto.js';
import { AuditoriaService } from './auditoria.service.js';

@ApiTags('auditoria')
@ApiBearerAuth()
@Controller('auditoria')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}


  @ApiListQuery({ actorId: 'uuid', entidad: 'text', entidadId: 'text', accion: 'text', desde: 'date', hasta: 'date' }, 200, 50)
  @Get()
  @ApiOkResponse({ type: [EventoAuditoriaRespuestaDto] })
  @RequirePermissions('auditoria.leer')
  listar(
    @Query(new ListQueryPipe({ actorId: 'uuid', entidad: 'text', entidadId: 'text', accion: 'text', desde: 'date', hasta: 'date' }, 200, 50)) query: ListQuery,
  ) {
    return this.auditoriaService.listar(query);
  }
}
