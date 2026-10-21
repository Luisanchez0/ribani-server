import {
  Body,
  Controller,
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

  @Get()
  @ApiOkResponse({ type: [AlertaRespuestaDto] })
  @RequirePermissions('alertas.leer')
  listar(
    @Req() request: AuthenticatedRequest,
    @Query('adultoId') adultoId?: string,
    @Query('estado') estado?: string,
    @Query('limite') limite?: string,
  ) {
    const esAdmin = request.user.rol?.codigo === 'ADMINISTRADOR';

    return this.alertasService.listar(request.user.id, esAdmin, {
      adultoId,
      estado,
      limite: limite ? Number(limite) : undefined,
    });
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

    return this.alertasService.stream(adultoId);
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
