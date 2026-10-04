import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateDispositivoDto } from './dto/create-dispositivo.dto.js';
import { UpdateDispositivoDto } from './dto/update-dispositivo.dto.js';

/** Nunca se devuelven identificador_hash ni push_token en las respuestas. */
const SELECT_DISPOSITIVO = {
  id: true,
  usuario_id: true,
  nombre: true,
  plataforma: true,
  version_app: true,
  ultimo_contacto_en: true,
  activo: true,
  created_at: true,
  updated_at: true,
} as const;

@Injectable()
export class DispositivosService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(usuarioId: string, dto: CreateDispositivoDto) {
    const identificadorHash = dto.identificador
      ? this.hashear(dto.identificador)
      : undefined;

    if (identificadorHash) {
      const existente = await this.prisma.dispositivos.findUnique({
        where: { identificador_hash: identificadorHash },
        select: { id: true, usuario_id: true, activo: true },
      });

      if (existente) {
        if (existente.usuario_id !== usuarioId) {
          throw new ConflictException(
            'El identificador del dispositivo ya está registrado.',
          );
        }

        return this.prisma.dispositivos.update({
          where: { id: existente.id },
          data: {
            nombre: dto.nombre,
            plataforma: dto.plataforma,
            ...(dto.push_token ? { push_token: dto.push_token } : {}),
            ...(dto.version_app ? { version_app: dto.version_app } : {}),
            activo: true,
          },
          select: SELECT_DISPOSITIVO,
        });
      }
    }

    return this.prisma.dispositivos.create({
      data: {
        usuario_id: usuarioId,
        nombre: dto.nombre,
        plataforma: dto.plataforma,
        ...(identificadorHash ? { identificador_hash: identificadorHash } : {}),
        ...(dto.push_token ? { push_token: dto.push_token } : {}),
        ...(dto.version_app ? { version_app: dto.version_app } : {}),
      },
      select: SELECT_DISPOSITIVO,
    });
  }


  async listar(
    usuarioId: string,
    esAdmin: boolean,
    options: { usuarioId?: string; soloActivas?: boolean },
  ) {
    const { usuarioId: filtroUsuarioId, soloActivas = true } = options;

    if (esAdmin) {
      return this.prisma.dispositivos.findMany({
        where: {
          ...(filtroUsuarioId ? { usuario_id: filtroUsuarioId } : {}),
          ...(soloActivas ? { activo: true } : {}),
        },
        select: SELECT_DISPOSITIVO,
        orderBy: { created_at: 'desc' },
      });
    }

    return this.prisma.dispositivos.findMany({
      where: {
        usuario_id: usuarioId,
        ...(soloActivas ? { activo: true } : {}),
      },
      select: SELECT_DISPOSITIVO,
      orderBy: { created_at: 'desc' },
    });
  }

  async obtener(usuarioId: string, esAdmin: boolean, id: string) {
    const dispositivo = await this.prisma.dispositivos.findUnique({
      where: { id },
      select: SELECT_DISPOSITIVO,
    });

    if (!dispositivo) {
      throw new NotFoundException('Dispositivo no encontrado.');
    }

    if (!esAdmin && dispositivo.usuario_id !== usuarioId) {
      throw new NotFoundException('Dispositivo no encontrado.');
    }

    return dispositivo;
  }

  async actualizar(usuarioId: string, id: string, dto: UpdateDispositivoDto) {
    const dispositivo = await this.prisma.dispositivos.findUnique({
      where: { id },
      select: { id: true, usuario_id: true },
    });

    if (!dispositivo || dispositivo.usuario_id !== usuarioId) {
      throw new NotFoundException('Dispositivo no encontrado.');
    }

    return this.prisma.dispositivos.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.push_token !== undefined ? { push_token: dto.push_token } : {}),
        ...(dto.version_app !== undefined
          ? { version_app: dto.version_app }
          : {}),
      },
      select: SELECT_DISPOSITIVO,
    });
  }


  async latido(usuarioId: string, id: string) {
    const dispositivo = await this.prisma.dispositivos.findUnique({
      where: { id },
      select: { id: true, usuario_id: true, activo: true },
    });

    if (
      !dispositivo ||
      dispositivo.usuario_id !== usuarioId ||
      !dispositivo.activo
    ) {
      throw new NotFoundException('Dispositivo no encontrado.');
    }

    const ahora = new Date();
    await this.prisma.dispositivos.update({
      where: { id },
      data: { ultimo_contacto_en: ahora },
      select: { id: true },
    });

    return { id, ultimo_contacto_en: ahora };
  }


  async remove(usuarioId: string, id: string) {
    const dispositivo = await this.prisma.dispositivos.findUnique({
      where: { id },
      select: { id: true, usuario_id: true },
    });

    if (!dispositivo || dispositivo.usuario_id !== usuarioId) {
      throw new NotFoundException('Dispositivo no encontrado.');
    }

    return this.prisma.dispositivos.update({
      where: { id },
      data: { activo: false },
      select: SELECT_DISPOSITIVO,
    });
  }

  /** SHA-256 del identificador: nunca se persiste el valor crudo. */
  private hashear(identificador: string): string {
    return createHash('sha256').update(identificador).digest('hex');
  }
}
