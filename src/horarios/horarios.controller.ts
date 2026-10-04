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

import { CreateHorarioDto } from './dto/create-horario.dto.js';
import { UpdateHorarioDto } from './dto/update-horario.dto.js';
import { HorariosService } from './horarios.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('horarios')
@ApiBearerAuth()
@Controller('medicamentos/:medicamentoId/horarios')
@UseGuards(JwtAuthGuard)
export class HorariosController {
  constructor(private readonly horariosService: HorariosService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param('medicamentoId', new ParseUUIDPipe()) medicamentoId: string,
    @Body() dto: CreateHorarioDto,
  ) {
    return this.horariosService.create(request.user.id, medicamentoId, dto);
  }

  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Param('medicamentoId', new ParseUUIDPipe()) medicamentoId: string,
    @Query('soloActivos') soloActivos?: string,
  ) {
    const soloActivosFlag = soloActivos !== 'false';
    return this.horariosService.findAll(
      request.user.id,
      medicamentoId,
      soloActivosFlag,
    );
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('medicamentoId', new ParseUUIDPipe()) medicamentoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.horariosService.findOne(request.user.id, medicamentoId, id);
  }

  @Patch(':id')
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
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('medicamentoId', new ParseUUIDPipe()) medicamentoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.horariosService.remove(request.user.id, medicamentoId, id);
  }
}
