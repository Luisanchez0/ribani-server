import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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

import { AsignarPermisosDto } from './dto/asignar-permisos.dto.js';
import { UpdateRolDto } from './dto/update-rol.dto.js';
import { RolesService } from './roles.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    rol: {
      codigo: string;
    };
  };
}

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * Permisos disponibles en el sistema (selector del panel).
   * NOTA: se declara ANTES de @Get(':id') para que NestJS no
   * matchee "permisos" como :id.
   */
  @Get('permisos')
  @RequirePermissions('roles.leer')
  listarPermisos() {
    return this.rolesService.listarPermisos();
  }

  @Get()
  @RequirePermissions('roles.leer')
  listar() {
    return this.rolesService.listar();
  }

  // NOTA: no existe POST /roles — la BD es una enumeración cerrada
  // (CHECK roles_codigo_chk: solo existen los 3 roles del sistema).
  // El valor del módulo es gestionar los PERMISOS de cada rol.

  @Get(':id')
  @RequirePermissions('roles.leer')
  obtener(@Param('id', new ParseIntPipe()) id: number) {
    return this.rolesService.obtener(id);
  }

  @Patch(':id')
  @RequirePermissions('roles.administrar')
  actualizar(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseIntPipe()) id: number,
    @Body() dto: UpdateRolDto,
  ) {
    return this.rolesService.actualizar(request.user.id, id, dto);
  }

  /** Reemplaza la lista completa de permisos del rol. */
  @Patch(':id/permisos')
  @RequirePermissions('roles.administrar')
  asignarPermisos(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseIntPipe()) id: number,
    @Body() dto: AsignarPermisosDto,
  ) {
    return this.rolesService.asignarPermisos(request.user.id, id, dto);
  }

  /** Los roles del sistema NO se pueden eliminar (409). */
  @Delete(':id')
  @RequirePermissions('roles.administrar')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseIntPipe()) id: number,
  ) {
    return this.rolesService.remove(request.user.id, id);
  }
}
