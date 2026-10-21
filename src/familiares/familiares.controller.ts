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
import { ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';

import { CreateFamiliarDto } from './dto/create-familiar.dto.js';
import { UpdateFamiliarDto } from './dto/update-familiar.dto.js';
import {
  AdultoVinculadoRespuestaDto,
  VinculoFamiliarRespuestaDto,
} from './dto/familiares-respuesta.dto.js';
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
  @ApiCreatedResponse({ type: VinculoFamiliarRespuestaDto })
  @RequirePermissions('relaciones.administrar')
  create(@Body() dto: CreateFamiliarDto) {
    return this.familiaresService.create(dto);
  }


  @Get()
  @ApiOkResponse({ type: [VinculoFamiliarRespuestaDto] })
  @RequirePermissions('relaciones.leer')
  findAll(@Req() request: AuthenticatedRequest) {
    return this.familiaresService.findAll(request.user.id, request.user.rol.codigo);
  }

  @Get('mis-adultos')
  @ApiOkResponse({ type: [AdultoVinculadoRespuestaDto] })
  @RequirePermissions('relaciones.leer')
  misAdultos(@Req() request: AuthenticatedRequest) {
    return this.familiaresService.misAdultos(request.user.id);
  }

  @Get('mis-familiares')
  @ApiOkResponse({ type: [VinculoFamiliarRespuestaDto] })
  misFamiliares(@Req() request: AuthenticatedRequest) {
    return this.familiaresService.misFamiliares(request.user.id);
  }

  @Get(':id')
  @ApiOkResponse({ type: VinculoFamiliarRespuestaDto })
  @RequirePermissions('relaciones.leer')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.familiaresService.findOne(request.user.id, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: VinculoFamiliarRespuestaDto })
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
  @ApiOkResponse({ type: VinculoFamiliarRespuestaDto })
  // El familiar del vínculo también puede revocarlo; la validación fina
  // (dueño del vínculo vs admin) vive en el service.
  @RequirePermissions('relaciones.leer')
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
