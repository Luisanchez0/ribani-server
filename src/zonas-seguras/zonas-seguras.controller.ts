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

import { CreateZonaSeguraDto } from './dto/create-zona-segura.dto.js';
import { UpdateZonaSeguraDto } from './dto/update-zona-segura.dto.js';
import { ZonasSegurasService } from './zonas-seguras.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('zonas-seguras')
@ApiBearerAuth()
@Controller('zonas-seguras')
@UseGuards(JwtAuthGuard)
export class ZonasSegurasController {
  constructor(private readonly zonasSegurasService: ZonasSegurasService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateZonaSeguraDto,
  ) {
    return this.zonasSegurasService.create(request.user.id, dto);
  }


  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query('adultoId') adultoId?: string,
    @Query('soloActivas') soloActivas?: string,
  ) {
    const soloActivasFlag = soloActivas !== 'false';
    return this.zonasSegurasService.findAll(request.user.id, {
      adultoId,
      soloActivas: soloActivasFlag,
    });
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.zonasSegurasService.findOne(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateZonaSeguraDto,
  ) {
    return this.zonasSegurasService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.zonasSegurasService.remove(request.user.id, id);
  }
}
