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

import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { VerifyTwoFactorDto } from '../auth/dto/verify-two-factor.dto.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';

import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';
import { UsuariosService } from './usuarios.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    rol: {
      codigo: string;
    };
  };
}

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('usuarios')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Lista usuarios para el panel admin. Filtros opcionales:
   * ?buscar=texto (nombre, apellido o email) y ?rol=CODIGO_ROL.
   */
  @Get()
  @RequirePermissions('usuarios.leer')
  findAll(
    @Query('buscar') buscar?: string,
    @Query('rol') rol?: string,
  ) {
    return this.usuariosService.findAll({ buscar, rol });
  }

  @Get(':id')
  @RequirePermissions('usuarios.leer')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usuariosService.findOne(id);
  }

  @Post()
  @RequirePermissions('usuarios.administrar')
  create(@Body() dto: CreateUsuarioDto) {
    return this.usuariosService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('usuarios.administrar')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    return this.usuariosService.update(id, dto);
  }

  @Patch(':id/activar')
  @RequirePermissions('usuarios.administrar')
  activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usuariosService.activate(id);
  }

  @Post(':id/2fa/setup')
  @RequirePermissions('usuarios.administrar_2fa')
  setupTwoFactorFor(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.authService.setupTwoFactorForUser(
      {
        id: request.user.id,
        rolCodigo: request.user.rol.codigo,
      },
      id,
    );
  }

  @Post(':id/2fa/verify')
  @RequirePermissions('usuarios.administrar_2fa')
  verifyTwoFactorFor(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VerifyTwoFactorDto,
  ) {
    return this.authService.verifyTwoFactorForUser(
      {
        id: request.user.id,
        rolCodigo: request.user.rol.codigo,
      },
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermissions('usuarios.administrar')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usuariosService.remove(id);
  }
}