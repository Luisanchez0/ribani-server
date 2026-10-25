import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TomaRespuestaDto } from './dto/toma-respuesta.dto.js';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';

import { CreateTomaDto } from './dto/create-toma.dto.js';
import { UpdateTomaDto } from './dto/update-toma.dto.js';
import { TomasService } from './tomas.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('tomas')
@ApiBearerAuth()
@Controller('tomas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TomasController {
  constructor(private readonly tomasService: TomasService) {}

  @Post()
  @RequirePermissions('tomas.actualizar')
  @ApiCreatedResponse({ type: TomaRespuestaDto })
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateTomaDto) {
    return this.tomasService.create(request.user.id, dto);
  }

  @ApiListQuery({ adultoId: 'uuid', medicamentoId: 'uuid', estado: ['PENDIENTE', 'POSPUESTA', 'TOMADA', 'OMITIDA', 'CANCELADA'], desde: 'date', hasta: 'date', incluirCanceladas: 'boolean' })
  @Get()
  @RequirePermissions('tomas.leer')
  @ApiOkResponse({ type: [TomaRespuestaDto] })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query(new ListQueryPipe({ adultoId: 'uuid', medicamentoId: 'uuid', estado: ['PENDIENTE', 'POSPUESTA', 'TOMADA', 'OMITIDA', 'CANCELADA'], desde: 'date', hasta: 'date', incluirCanceladas: 'boolean' })) query: ListQuery,
  ) {
    return this.tomasService.findAll(request.user.id, query);
  }

  @Get(':id')
  @RequirePermissions('tomas.leer')
  @ApiOkResponse({ type: TomaRespuestaDto })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tomasService.findOne(request.user.id, id);
  }

  @Patch(':id')
  @RequirePermissions('tomas.actualizar')
  @ApiOkResponse({ type: TomaRespuestaDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTomaDto,
  ) {
    return this.tomasService.update(request.user.id, id, dto);
  }

  /**
   * Baja lógica del historial: la toma pasa a CANCELADA y deja de listarse.
   * La fila se conserva para auditoría.
   */
  @Delete(':id')
  @RequirePermissions('tomas.actualizar')
  @ApiOkResponse({ description: 'Toma eliminada del historial (baja lógica).' })
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tomasService.remove(request.user.id, id);
  }

  @Post(':id/posponer')
  @RequirePermissions('tomas.actualizar')
  @ApiCreatedResponse({
    type: TomaRespuestaDto,
    description: 'Una vez, diez minutos, dentro de la ventana original.',
  })
  posponer(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tomasService.posponer(request.user.id, id);
  }
}
