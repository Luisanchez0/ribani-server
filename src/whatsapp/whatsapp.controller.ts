import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import { WhatsappService } from './whatsapp.service.js';
import {
  ConfiguracionWhatsappDto,
  ConsentimientoWhatsappDto,
  DestinatarioWhatsappDto,
  IntegracionWhatsappDto,
  NotificacionWhatsappDto,
  PreferenciasWhatsappDto,
  RegistrarDestinatarioDto,
  ResumenAlertaWhatsappDto,
} from './dto/whatsapp.dto.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';

interface Sesion extends Request {
  user: { id: string; rol: { codigo: string } };
}
const admin = (r: Sesion) => r.user.rol.codigo === 'ADMINISTRADOR';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get('integracion')
  @ApiOkResponse({ type: IntegracionWhatsappDto })
  integracion() {
    return this.whatsapp.integracion();
  }

  @Get('destinatarios')
  @ApiOkResponse({ type: [DestinatarioWhatsappDto] })
  listar(@Req() req: Sesion) {
    return this.whatsapp.listar(req.user.id, admin(req));
  }

  @Post('destinatarios')
  @ApiCreatedResponse({ type: DestinatarioWhatsappDto })
  registrar(@Req() req: Sesion, @Body() dto: RegistrarDestinatarioDto) {
    return this.whatsapp.registrar(req.user.id, admin(req), dto);
  }

  @Patch('destinatarios/:id/consentimiento')
  @ApiOkResponse({ type: DestinatarioWhatsappDto })
  consentimiento(
    @Req() req: Sesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConsentimientoWhatsappDto,
  ) {
    return this.whatsapp.consentimiento(req.user.id, admin(req), id, dto);
  }

  @Post('destinatarios/:id/prueba')
  @ApiCreatedResponse({ type: NotificacionWhatsappDto })
  prueba(@Req() req: Sesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.whatsapp.prueba(req.user.id, admin(req), id);
  }

  @Get('historial')
  @ApiOkResponse({ type: [NotificacionWhatsappDto] })
  historial(@Req() req: Sesion) {
    return this.whatsapp.historial(req.user.id, admin(req));
  }

  @Get('alertas/resumen')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('alertas.leer')
  @ApiOkResponse({ type: [ResumenAlertaWhatsappDto] })
  resumenAlertas(@Req() req: Sesion) {
    return this.whatsapp.resumenAlertas(req.user.id, admin(req));
  }

  @Get('adultos/:adultoId/preferencias')
  @ApiOkResponse({ type: ConfiguracionWhatsappDto })
  preferencias(
    @Req() req: Sesion,
    @Param('adultoId', ParseUUIDPipe) id: string,
  ) {
    return this.whatsapp.preferencias(req.user.id, admin(req), id);
  }

  @Patch('adultos/:adultoId/preferencias')
  @ApiOkResponse({ type: ConfiguracionWhatsappDto })
  guardarPreferencias(
    @Req() req: Sesion,
    @Param('adultoId', ParseUUIDPipe) id: string,
    @Body() dto: PreferenciasWhatsappDto,
  ) {
    return this.whatsapp.guardarPreferencias(req.user.id, admin(req), id, dto);
  }
}
