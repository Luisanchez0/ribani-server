import {
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';

import { CreateUbicacionDto } from './dto/create-ubicacion.dto.js';
import { UbicacionesService } from './ubicaciones.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('ubicaciones')
@ApiBearerAuth()
@Controller('ubicaciones')
@UseGuards(JwtAuthGuard)
export class UbicacionesController {
  constructor(private readonly ubicacionesService: UbicacionesService) {}


  @Post()
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

  @Get('actual')
  actual(
    @Req() request: AuthenticatedRequest,
    @Query('adultoId', new ParseUUIDPipe()) adultoId: string,
  ) {
    return this.ubicacionesService.ultima(request.user.id, adultoId);
  }

  @Get('historial')
  historial(
    @Req() request: AuthenticatedRequest,
    @Query('adultoId', new ParseUUIDPipe()) adultoId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limite') limite?: string,
  ) {
    return this.ubicacionesService.historial(request.user.id, adultoId, {
      desde,
      hasta,
      limite: limite ? Number(limite) : undefined,
    });
  }

  @Sse('stream')
  async stream(
    @Req() request: AuthenticatedRequest,
    @Query('adultoId', new ParseUUIDPipe()) adultoId: string,
  ) {
    // Autorización antes de abrir la conexión (403 si no procede).
    await this.ubicacionesService.verificarAcceso(request.user.id, adultoId);

    return this.ubicacionesService.stream(request.user.id, adultoId);
  }
}
