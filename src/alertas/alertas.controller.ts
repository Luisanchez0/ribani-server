import { ApiListQuery, ListQueryPipe, type ListQuery } from '../common/pipes/list-query.pipe.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';

import { AlertasService } from './alertas.service.js';
import { CreateAlertaDto } from './dto/create-alerta.dto.js';
import { ResolverAlertaDto } from './dto/resolver-alerta.dto.js';
import {
  AlertaRespuestaDto,
  IntervaloUbicacionRespuestaDto,
} from './dto/alerta-respuesta.dto.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    sessionId: string;
    accessExpiresAt: number;
    rol: {
      codigo: string;
    };
  };
}

@ApiTags('alertas')
@ApiBearerAuth()
@Controller('alertas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AlertasController {
  constructor(private readonly alertasService: AlertasService) {}

  @Post()
  @ApiCreatedResponse({ type: AlertaRespuestaDto })
  @RequirePermissions('alertas.crear')
  crear(@Req() request: AuthenticatedRequest, @Body() dto: CreateAlertaDto) {
    return this.alertasService.crear(request.user.id, dto);
  }


  @Get('intervalo-ubicacion')
  @ApiOkResponse({ type: IntervaloUbicacionRespuestaDto })
  @RequirePermissions('alertas.leer')
  intervaloUbicacion(@Req() request: AuthenticatedRequest) {
    return this.alertasService.intervaloReporteUbicacion(request.user.id);
  }

  @ApiListQuery({ adultoId: 'uuid', estado: ['ABIERTA', 'EN_ATENCION', 'RESUELTA', 'CANCELADA'], incluirCanceladas: 'boolean' })
  @Get()
  @ApiOkResponse({ type: [AlertaRespuestaDto] })
  @RequirePermissions('alertas.leer')
  listar(
    @Req() request: AuthenticatedRequest,
    @Query(new ListQueryPipe({ adultoId: 'uuid', estado: ['ABIERTA', 'EN_ATENCION', 'RESUELTA', 'CANCELADA'], incluirCanceladas: 'boolean' })) query: ListQuery,
  ) {
    const esAdmin = request.user.rol?.codigo === 'ADMINISTRADOR';
    return this.alertasService.listar(request.user.id, esAdmin, query);
  }

  @Sse('stream')
  @RequirePermissions('alertas.leer')
  async stream(
    @Req() request: AuthenticatedRequest,
    @Query('adultoId', new ParseUUIDPipe()) adultoId: string,
  ) {
    const esAdmin = request.user.rol?.codigo === 'ADMINISTRADOR';

    await this.alertasService.verificarAcceso(
      request.user.id,
      esAdmin,
      adultoId,
    );

    return this.alertasService.stream(adultoId, request.user);
  }

  @Get(':id')
  @ApiOkResponse({ type: AlertaRespuestaDto })
  @RequirePermissions('alertas.leer')
  obtener(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const esAdmin = request.user.rol?.codigo === 'ADMINISTRADOR';

    return this.alertasService.obtener(request.user.id, esAdmin, id);
  }

  /**
   * Elimina la alerta del historial (baja lógica: estado CANCELADA). Aplica
   * al adulto propio, al familiar con vínculo ACTIVA y al administrador.
   */
  @Delete(':id')
  @ApiOkResponse({ type: AlertaRespuestaDto, description: 'Alerta eliminada del historial (baja lógica).' })
  @RequirePermissions('alertas.actualizar')
  eliminar(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const esAdmin = request.user.rol?.codigo === 'ADMINISTRADOR';

    return this.alertasService.eliminar(request.user.id, esAdmin, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AlertaRespuestaDto })
  @RequirePermissions('alertas.actualizar')
  actualizar(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolverAlertaDto,
  ) {
    const esAdmin = request.user.rol?.codigo === 'ADMINISTRADOR';

    return this.alertasService.actualizar(request.user.id, esAdmin, id, dto);
  }
}
