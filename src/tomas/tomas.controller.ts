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
@UseGuards(JwtAuthGuard)
export class TomasController {
  constructor(private readonly tomasService: TomasService) {}

  @Post()
  @ApiCreatedResponse({ type: TomaRespuestaDto })
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateTomaDto) {
    return this.tomasService.create(request.user.id, dto);
  }

  @Get()
  @ApiOkResponse({ type: [TomaRespuestaDto] })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query('adultoId') adultoId?: string,
    @Query('medicamentoId') medicamentoId?: string,
    @Query('estado') estado?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.tomasService.findAll(request.user.id, {
      adultoId,
      medicamentoId,
      estado,
      desde,
      hasta,
    });
  }

  @Get(':id')
  @ApiOkResponse({ type: TomaRespuestaDto })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tomasService.findOne(request.user.id, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: TomaRespuestaDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTomaDto,
  ) {
    return this.tomasService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  // Conserva el contrato de baja existente; POSPUESTA se registra, no se borra.
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tomasService.remove(request.user.id, id);
  }

  @Post(':id/posponer')
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
