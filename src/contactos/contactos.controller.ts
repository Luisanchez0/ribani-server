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

import { CreateContactoDto } from './dto/create-contacto.dto.js';
import { UpdateContactoDto } from './dto/update-contacto.dto.js';
import { ContactosService } from './contactos.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('contactos')
@ApiBearerAuth()
@Controller('contactos')
@UseGuards(JwtAuthGuard)
export class ContactosController {
  constructor(private readonly contactosService: ContactosService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateContactoDto,
  ) {
    return this.contactosService.create(request.user.id, dto);
  }

  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query('soloActivos') soloActivos?: string,
  ) {
    const soloActivosFlag = soloActivos !== 'false';
    return this.contactosService.findAll(request.user.id, soloActivosFlag);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.contactosService.findOne(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateContactoDto,
  ) {
    return this.contactosService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.contactosService.remove(request.user.id, id);
  }
}
