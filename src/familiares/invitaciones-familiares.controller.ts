import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';

import { CompletarInvitacionFamiliarDto } from './dto/completar-invitacion-familiar.dto.js';
import { CrearInvitacionFamiliarDto } from './dto/crear-invitacion-familiar.dto.js';
import {
  CompletarInvitacionRespuestaDto,
  InvitacionFamiliarRespuestaDto,
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
@Controller('familiares/invitaciones')
export class InvitacionesFamiliaresController {
  constructor(private readonly familiaresService: FamiliaresService) {}

  /** El familiar encargado (o admin) invita al adulto mayor por su correo. */
  @Post()
  @ApiCreatedResponse({ type: InvitacionFamiliarRespuestaDto })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  invitar(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CrearInvitacionFamiliarDto,
  ) {
    return this.familiaresService.invitarPorEmail(
      request.user.id,
      request.user.rol.codigo,
      dto,
    );
  }

  /** El adulto invitado completa su registro y activa el vínculo. */
  @Post('completar')
  @ApiCreatedResponse({ type: CompletarInvitacionRespuestaDto })
  completar(@Body() dto: CompletarInvitacionFamiliarDto) {
    return this.familiaresService.completarInvitacion(dto);
  }

  /** El adulto acepta la invitación (vínculo PENDIENTE → ACTIVA). */
  @Post(':id/aceptar')
  @ApiCreatedResponse({ type: VinculoFamiliarRespuestaDto })
  @UseGuards(JwtAuthGuard)
  aceptar(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.familiaresService.aceptarInvitacion(
      request.user.id,
      request.user.rol.codigo,
      id,
    );
  }

  /** El adulto rechaza la invitación (vínculo PENDIENTE → REVOCADA). */
  @Post(':id/rechazar')
  @ApiCreatedResponse({ type: VinculoFamiliarRespuestaDto })
  @UseGuards(JwtAuthGuard)
  rechazar(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.familiaresService.rechazarInvitacion(
      request.user.id,
      request.user.rol.codigo,
      id,
    );
  }

  /** Lista de invitaciones PENDIENTES dirigidas al adulto autenticado. */
  @Get('pendientes')
  @ApiOkResponse({ type: [VinculoFamiliarRespuestaDto] })
  @UseGuards(JwtAuthGuard)
  pendientes(@Req() request: AuthenticatedRequest) {
    return this.familiaresService.invitacionesPendientes(request.user.id);
  }
}
