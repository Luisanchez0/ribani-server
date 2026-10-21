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

import { CreateDispositivoDto } from './dto/create-dispositivo.dto.js';
import { UpdateDispositivoDto } from './dto/update-dispositivo.dto.js';
import { DispositivoRespuestaDto } from './dto/dispositivo-respuesta.dto.js';
import { DispositivosService } from './dispositivos.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    rol: {
      codigo: string;
    };
  };
}

@ApiTags('dispositivos')
@ApiBearerAuth()
@Controller('dispositivos')
@UseGuards(JwtAuthGuard)
export class DispositivosController {
  constructor(private readonly dispositivosService: DispositivosService) {}

  @Post()
  @ApiCreatedResponse({ type: DispositivoRespuestaDto })
  registrar(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateDispositivoDto,
  ) {
    return this.dispositivosService.registrar(request.user.id, dto);
  }


  @Get()
  @ApiOkResponse({ type: [DispositivoRespuestaDto] })
  listar(
    @Req() request: AuthenticatedRequest,
    @Query('usuarioId') usuarioId?: string,
    @Query('soloActivas') soloActivas?: string,
  ) {
    const esAdmin = request.user.rol?.codigo === 'ADMINISTRADOR';

    return this.dispositivosService.listar(request.user.id, esAdmin, {
      usuarioId: esAdmin ? usuarioId : undefined,
      soloActivas: soloActivas !== 'false',
    });
  }

  @Post(':id/latido')
  @ApiCreatedResponse({ type: DispositivoRespuestaDto })
  latido(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.dispositivosService.latido(request.user.id, id);
  }

  @Get(':id')
  @ApiOkResponse({ type: DispositivoRespuestaDto })
  obtener(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const esAdmin = request.user.rol?.codigo === 'ADMINISTRADOR';

    return this.dispositivosService.obtener(request.user.id, esAdmin, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: DispositivoRespuestaDto })
  actualizar(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDispositivoDto,
  ) {
    return this.dispositivosService.actualizar(request.user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.dispositivosService.remove(request.user.id, id);
  }
}
