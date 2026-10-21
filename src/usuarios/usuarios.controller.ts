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
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { VerifyTwoFactorDto } from '../auth/dto/verify-two-factor.dto.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';

import { CambiarPasswordDto } from './dto/cambiar-password.dto.js';
import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { UpdatePerfilDto } from './dto/update-perfil.dto.js';
import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';
import { UsuariosService } from './usuarios.service.js';
import { PasswordActualizadaDto, UsuarioRespuestaDto } from './dto/usuario-respuesta.dto.js';
import { ConfigDosPasosDto, EstadoDosPasosDto } from '../auth/dto/auth-respuesta.dto.js';

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
   * Perfil del usuario autenticado: solo exige JWT (sin permisos de
   * administración). Declaradas ANTES de las rutas `:id` para que
   * 'perfil' no se interprete como un UUID.
   */
  @Get('perfil')
  @ApiOkResponse({ type: UsuarioRespuestaDto })
  miPerfil(@Req() request: AuthenticatedRequest) {
    return this.usuariosService.obtenerPerfil(request.user.id);
  }

  @Patch('perfil')
  @ApiOkResponse({ type: UsuarioRespuestaDto })
  editarMiPerfil(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdatePerfilDto,
  ) {
    return this.usuariosService.actualizarPerfil(request.user.id, dto);
  }

  /**
   * Cambio de CONTRASEÑA PROPIA: pide la contraseña actual en el body
   * (el endpoint solo exige JWT; el cambio de la de OTRO usuario sigue
   * siendo PATCH /usuarios/{id} con usuarios.administrar).
   */
  @Patch('perfil/password')
  @ApiOkResponse({ description: 'Contraseña propia actualizada.', type: PasswordActualizadaDto })
  cambiarMiPassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CambiarPasswordDto,
  ) {
    return this.usuariosService.cambiarPasswordPropio(request.user.id, dto);
  }

  /**
   * Lista usuarios para el panel admin. Filtros opcionales:
   * ?buscar=texto (nombre, apellido o email) y ?rol=CODIGO_ROL.
   */
  @Get()
  @ApiOkResponse({ type: [UsuarioRespuestaDto] })
  @RequirePermissions('usuarios.leer')
  findAll(
    @Query('buscar') buscar?: string,
    @Query('rol') rol?: string,
  ) {
    return this.usuariosService.findAll({ buscar, rol });
  }

  @Get(':id')
  @ApiOkResponse({ type: UsuarioRespuestaDto })
  @RequirePermissions('usuarios.leer')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usuariosService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: UsuarioRespuestaDto })
  @RequirePermissions('usuarios.administrar')
  create(@Body() dto: CreateUsuarioDto) {
    return this.usuariosService.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UsuarioRespuestaDto })
  @RequirePermissions('usuarios.administrar')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    return this.usuariosService.update(id, dto);
  }

  @Patch(':id/activar')
  @ApiOkResponse({ type: UsuarioRespuestaDto })
  @RequirePermissions('usuarios.administrar')
  activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usuariosService.activate(id);
  }

  /**
   * Desactiva (baja lógica) al usuario: no borra la fila, solo deja
   * `activo = false` para que no pueda iniciar sesión.
   */
  @Patch(':id/desactivar')
  @ApiOkResponse({ description: 'Usuario desactivado (baja lógica).', type: UsuarioRespuestaDto })
  @RequirePermissions('usuarios.administrar')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usuariosService.deactivate(id);
  }

  @Post(':id/2fa/setup')
  @ApiCreatedResponse({ type: ConfigDosPasosDto })
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
  @ApiCreatedResponse({ type: EstadoDosPasosDto })
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

  /**
   * Elimina definitivamente al usuario de la base de datos.
   */
  @Delete(':id')
  @ApiOkResponse({ description: 'Usuario eliminado de la BD.', schema: {
    type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } },
  } })
  @RequirePermissions('usuarios.administrar')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usuariosService.remove(id);
  }
}
