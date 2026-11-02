import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
import { ApiListQuery, ListQueryPipe, type ListQuery } from '../common/pipes/list-query.pipe.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';

import { CreateUbicacionDto } from './dto/create-ubicacion.dto.js';
import { CrearLoteUbicacionesDto } from './dto/crear-lote-ubicaciones.dto.js';
import {
  LoteUbicacionesRespuestaDto,
  UbicacionAdultoResumenDto,
  UbicacionRespuestaDto,
} from './dto/ubicacion-respuesta.dto.js';
import { UbicacionesService } from './ubicaciones.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    sessionId: string;
    accessExpiresAt: number;
  };
}

@ApiTags('ubicaciones')
@ApiBearerAuth()
@Controller('ubicaciones')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UbicacionesController {
  constructor(private readonly ubicacionesService: UbicacionesService) {}


  @Post()
  @ApiCreatedResponse({ type: UbicacionRespuestaDto })
  reportar(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateUbicacionDto,
  ) {
    return this.ubicacionesService.reportar(
      request.user.id,
      dto,
      dto.dispositivo_id,
    );
  }

  /** Lote de reportes acumulados por la app (ahorro de batería). */
  @Post('lote')
  @ApiCreatedResponse({ type: LoteUbicacionesRespuestaDto })
  reportarLote(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CrearLoteUbicacionesDto,
  ) {
    return this.ubicacionesService.reportarLote(request.user.id, dto);
  }

  /**
   * Última ubicación de todos los adultos activos en una sola respuesta, para
   * el mapa del panel administrador. Solo administradores.
   */
  @Get('ultimas')
  @RequirePermissions('ubicaciones.leer')
  @ApiOkResponse({ type: [UbicacionAdultoResumenDto] })
  ultimas(@Req() request: AuthenticatedRequest) {
    return this.ubicacionesService.ultimas(request.user.id);
  }

  @Get('actual')
  @RequirePermissions('ubicaciones.leer')
  @ApiOkResponse({ type: UbicacionRespuestaDto })
  actual(
    @Req() request: AuthenticatedRequest,
    @Query('adultoId', new ParseUUIDPipe()) adultoId: string,
  ) {
    return this.ubicacionesService.ultima(request.user.id, adultoId);
  }

  @ApiListQuery({ adultoId: 'uuid', desde: 'date', hasta: 'date' })
  @Get('historial')
  @RequirePermissions('ubicaciones.leer')
  @ApiOkResponse({ type: [UbicacionRespuestaDto] })
  historial(
    @Req() request: AuthenticatedRequest,
    @Query(new ListQueryPipe({ adultoId: 'uuid', desde: 'date', hasta: 'date' })) query: ListQuery,
  ) {
    if (!query.adultoId) throw new BadRequestException('adultoId es obligatorio.');
    return this.ubicacionesService.historial(request.user.id, query.adultoId, query);
  }

  @Sse('stream')
  @RequirePermissions('ubicaciones.leer')
  async stream(
    @Req() request: AuthenticatedRequest,
    @Query('adultoId', new ParseUUIDPipe()) adultoId: string,
  ) {
    // Autorización antes de abrir la conexión (403 si no procede).
    await this.ubicacionesService.verificarAcceso(request.user.id, adultoId);

    return this.ubicacionesService.stream(request.user.id, adultoId, request.user);
  }
}
