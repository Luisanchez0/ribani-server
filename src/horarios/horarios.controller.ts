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
import { ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';

import { CreateHorarioDto } from './dto/create-horario.dto.js';
import { UpdateHorarioDto } from './dto/update-horario.dto.js';
import { HorarioRespuestaDto } from './dto/horario-respuesta.dto.js';
import { HorariosService } from './horarios.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('horarios')
@ApiBearerAuth()
@Controller('horarios')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HorariosListaController {
  constructor(private readonly horariosService: HorariosService) {}

  /**
   * Listado plano para la app móvil: horarios activos de los
   * medicamentos que el usuario puede ver (él mismo, sus adultos
   * vinculados o todos si es ADMINISTRADOR).
   *
   * GET /horarios?adultoId=&medicamentoId=&soloActivos=true
   */
  @ApiListQuery({ adultoId: 'uuid', medicamentoId: 'uuid', soloActivos: 'boolean' })
  @Get()
  @RequirePermissions('medicamentos.leer')
  @ApiOkResponse({ type: [HorarioRespuestaDto] })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query(new ListQueryPipe({ adultoId: 'uuid', medicamentoId: 'uuid', soloActivos: 'boolean' })) query: ListQuery,
  ) {
    return this.horariosService.findAllDelUsuario(request.user.id, {
      adultoId: query.adultoId,
      medicamentoId: query.medicamentoId,
      soloActivos: query.soloActivos ?? true,
      limite: query.limite,
    });
  }
}

@ApiTags('horarios')
@ApiBearerAuth()
@Controller('medicamentos/:medicamentoId/horarios')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HorariosController {
  constructor(private readonly horariosService: HorariosService) {}

  @Post()
  @RequirePermissions('medicamentos.crear')
  @ApiCreatedResponse({ type: HorarioRespuestaDto })
  create(
    @Req() request: AuthenticatedRequest,
    @Param('medicamentoId', new ParseUUIDPipe()) medicamentoId: string,
    @Body() dto: CreateHorarioDto,
  ) {
    return this.horariosService.create(request.user.id, medicamentoId, dto);
  }

  @ApiListQuery({ soloActivos: 'boolean' })
  @Get()
  @RequirePermissions('medicamentos.leer')
  @ApiOkResponse({ type: [HorarioRespuestaDto] })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Param('medicamentoId', new ParseUUIDPipe()) medicamentoId: string,
    @Query(new ListQueryPipe({ soloActivos: 'boolean' })) query: ListQuery,
  ) {
    return this.horariosService.findAll(
      request.user.id,
      medicamentoId,
      query.soloActivos ?? true,
      query.limite,
    );
  }

  @Get(':id')
  @RequirePermissions('medicamentos.leer')
  @ApiOkResponse({ type: HorarioRespuestaDto })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('medicamentoId', new ParseUUIDPipe()) medicamentoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.horariosService.findOne(request.user.id, medicamentoId, id);
  }

  @Patch(':id')
  @RequirePermissions('medicamentos.actualizar')
  @ApiOkResponse({ type: HorarioRespuestaDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('medicamentoId', new ParseUUIDPipe()) medicamentoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateHorarioDto,
  ) {
    return this.horariosService.update(
      request.user.id,
      medicamentoId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermissions('medicamentos.actualizar')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('medicamentoId', new ParseUUIDPipe()) medicamentoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.horariosService.remove(request.user.id, medicamentoId, id);
  }
}
