import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(options?: { buscar?: string; rol?: string }) {
    const { buscar, rol } = options ?? {};

    return this.prisma.usuarios.findMany({
      where: {
        ...(buscar && buscar.trim()
          ? {
              OR: [
                { nombre: { contains: buscar.trim(), mode: 'insensitive' } },
                { apellido: { contains: buscar.trim(), mode: 'insensitive' } },
                { email: { contains: buscar.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(rol && rol.trim()
          ? { roles: { codigo: rol.trim().toUpperCase() } }
          : {}),
      },
      select: {
        id: true,
        rol_id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        email_verificado_en: true,
        activo: true,
        ultimo_acceso_en: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        rol_id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        email_verificado_en: true,
        activo: true,
        ultimo_acceso_en: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException(
        `No se encontró el usuario con ID ${id}`,
      );
    }

    return usuario;
  }

  private async resolveRoleId(
    rolCodigo: string,
  ): Promise<number> {
    const rol = await this.prisma.roles.findUnique({
      where: {
        codigo: rolCodigo,
      },
      select: {
        id: true,
        activo: true,
      },
    });

    if (!rol || !rol.activo) {
      throw new BadRequestException(
        `El rol '${rolCodigo}' no existe o está inactivo.`,
      );
    }

    return rol.id;
  }

  async create(createUsuarioDto: CreateUsuarioDto) {
    const existingUser = await this.prisma.usuarios.findUnique({
      where: {
        email: createUsuarioDto.email,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'Ya existe un usuario con ese correo electrónico',
      );
    }

    const rolId = await this.resolveRoleId(
      createUsuarioDto.rol_codigo,
    );

    const passwordHash = await bcrypt.hash(
      createUsuarioDto.password,
      12,
    );

    return this.prisma.usuarios.create({
      data: {
        rol_id: rolId,
        nombre: createUsuarioDto.nombre,
        apellido: createUsuarioDto.apellido,
        email: createUsuarioDto.email,
        telefono: createUsuarioDto.telefono,
        password_hash: passwordHash,
        activo: createUsuarioDto.activo ?? true,
      },
      select: {
        id: true,
        rol_id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        email_verificado_en: true,
        activo: true,
        ultimo_acceso_en: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async update(id: string, updateUsuarioDto: UpdateUsuarioDto) {
    await this.findOne(id);

    if (updateUsuarioDto.email) {
      const existingUser = await this.prisma.usuarios.findFirst({
        where: {
          email: updateUsuarioDto.email,
          NOT: {
            id,
          },
        },
      });

      if (existingUser) {
        throw new ConflictException(
          'Ya existe otro usuario con ese correo electrónico',
        );
      }
    }

    const passwordHash = updateUsuarioDto.password
      ? await bcrypt.hash(updateUsuarioDto.password, 12)
      : undefined;

    const rolId = updateUsuarioDto.rol_codigo
      ? await this.resolveRoleId(updateUsuarioDto.rol_codigo)
      : undefined;

    return this.prisma.usuarios.update({
      where: {
        id,
      },
      data: {
        rol_id: rolId,
        nombre: updateUsuarioDto.nombre,
        apellido: updateUsuarioDto.apellido,
        email: updateUsuarioDto.email,
        telefono: updateUsuarioDto.telefono,
        password_hash: passwordHash,
        activo: updateUsuarioDto.activo,
      },
      select: {
        id: true,
        rol_id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        email_verificado_en: true,
        activo: true,
        ultimo_acceso_en: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.usuarios.update({
      where: {
        id,
      },
      data: {
        activo: false,
      },
      select: {
        id: true,
        rol_id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        email_verificado_en: true,
        activo: true,
        ultimo_acceso_en: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async activate(id: string) {
    await this.findOne(id);

    return this.prisma.usuarios.update({
      where: {
        id,
      },
      data: {
        activo: true,
      },
      select: {
        id: true,
        rol_id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        email_verificado_en: true,
        activo: true,
        ultimo_acceso_en: true,
        created_at: true,
        updated_at: true,
      },
    });
  }
}