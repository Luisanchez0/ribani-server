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

import { CreateMedicamentoDto } from './dto/create-medicamento.dto.js';
import { UpdateMedicamentoDto } from './dto/update-medicamento.dto.js';
import { MedicamentoRespuestaDto } from './dto/medicamento-respuesta.dto.js';
import { MedicamentosService } from './medicamentos.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('medicamentos')
@ApiBearerAuth()
@Controller('medicamentos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MedicamentosController {
  constructor(private readonly medicamentosService: MedicamentosService) {}

  @Post()
  @RequirePermissions('medicamentos.crear')
  @ApiCreatedResponse({ type: MedicamentoRespuestaDto })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateMedicamentoDto,
  ) {
    return this.medicamentosService.create(request.user.id, dto);
  }

  @ApiListQuery({ adultoId: 'uuid', soloActivos: 'boolean' })
  @Get()
  @RequirePermissions('medicamentos.leer')
  @ApiOkResponse({ type: [MedicamentoRespuestaDto] })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query(new ListQueryPipe({ adultoId: 'uuid', soloActivos: 'boolean' })) query: ListQuery,
  ) {
    return this.medicamentosService.findAll(request.user.id, { adultoId: query.adultoId, soloActivos: query.soloActivos ?? true, limite: query.limite });
  }

  @Get(':id')
  @RequirePermissions('medicamentos.leer')
  @ApiOkResponse({ type: MedicamentoRespuestaDto })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.medicamentosService.findOne(request.user.id, id);
  }

  @Patch(':id')
  @RequirePermissions('medicamentos.actualizar')
  @ApiOkResponse({ type: MedicamentoRespuestaDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMedicamentoDto,
  ) {
    return this.medicamentosService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('medicamentos.actualizar')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.medicamentosService.remove(request.user.id, id);
  }
}
