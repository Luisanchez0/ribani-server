import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/gurads/jwt-auth.guard.js';
import {
  ActualizarConfiguracionDto,
  ConfiguracionRespuestaDto,
} from './configuracion.dto.js';
import { ConfiguracionService } from './configuracion.service.js';
@Controller('configuracion')
@ApiTags('configuracion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}
  @Get()
  @ApiOkResponse({ type: ConfiguracionRespuestaDto })
  obtener(@Req() req: { user: { id: string } }) {
    return this.configuracion.obtener(req.user.id);
  }
  @Patch()
  @ApiOkResponse({ type: ConfiguracionRespuestaDto })
  actualizar(
    @Req() req: { user: { id: string } },
    @Body() dto: ActualizarConfiguracionDto,
  ) {
    return this.configuracion.actualizar(req.user.id, dto);
  }
}
