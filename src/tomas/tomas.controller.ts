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
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateTomaDto,
  ) {
    return this.tomasService.create(request.user.id, dto);
  }

  @Get()
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
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tomasService.findOne(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTomaDto,
  ) {
    return this.tomasService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tomasService.remove(request.user.id, id);
  }
}
