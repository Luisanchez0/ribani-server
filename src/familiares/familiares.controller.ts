import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';

import { CreateFamiliarDto } from './dto/create-familiar.dto.js';
import { UpdateFamiliarDto } from './dto/update-familiar.dto.js';
import { FamiliaresService } from './familiares.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    rol: {
      codigo: string;
    };
  };
}

@ApiTags('familiares')
@ApiBearerAuth()
@Controller('familiares')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FamiliaresController {
  constructor(private readonly familiaresService: FamiliaresService) {}

  /** Vincular familiar con adulto mayor. */
  @Post()
  @RequirePermissions('relaciones.administrar')
  create(@Body() dto: CreateFamiliarDto) {
    return this.familiaresService.create(dto);
  }


  @Get()
  @RequirePermissions('relaciones.leer')
  findAll(@Req() request: AuthenticatedRequest) {
    return this.familiaresService.findAll(request.user.id, request.user.rol.codigo);
  }

  @Get('mis-adultos')
  @RequirePermissions('relaciones.leer')
  misAdultos(@Req() request: AuthenticatedRequest) {
    return this.familiaresService.misAdultos(request.user.id);
  }

  @Get('mis-familiares')
  misFamiliares(@Req() request: AuthenticatedRequest) {
    return this.familiaresService.misFamiliares(request.user.id);
  }

  @Get(':id')
  @RequirePermissions('relaciones.leer')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.familiaresService.findOne(request.user.id, id);
  }

  @Patch(':id')
  @RequirePermissions('relaciones.administrar')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFamiliarDto,
  ) {
    return this.familiaresService.update(
      request.user.id,
      request.user.rol.codigo,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermissions('relaciones.administrar')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.familiaresService.remove(
      request.user.id,
      request.user.rol.codigo,
      id,
    );
  }
}
