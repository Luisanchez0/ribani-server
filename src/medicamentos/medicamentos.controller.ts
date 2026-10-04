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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';

import { CreateMedicamentoDto } from './dto/create-medicamento.dto.js';
import { UpdateMedicamentoDto } from './dto/update-medicamento.dto.js';
import { MedicamentosService } from './medicamentos.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('medicamentos')
@ApiBearerAuth()
@Controller('medicamentos')
@UseGuards(JwtAuthGuard)
export class MedicamentosController {
  constructor(private readonly medicamentosService: MedicamentosService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateMedicamentoDto,
  ) {
    return this.medicamentosService.create(request.user.id, dto);
  }

  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query('soloActivos') soloActivos?: string,
    @Query('adultoId') adultoId?: string,
  ) {
    const soloActivosFlag = soloActivos !== 'false';
    return this.medicamentosService.findAll(request.user.id, {
      adultoId,
      soloActivos: soloActivosFlag,
    });
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.medicamentosService.findOne(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMedicamentoDto,
  ) {
    return this.medicamentosService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.medicamentosService.remove(request.user.id, id);
  }
}
