import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.usuarios.findMany({
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

    return this.prisma.usuarios.create({
      data: {
        rol_id: createUsuarioDto.rol_id,
        nombre: createUsuarioDto.nombre,
        apellido: createUsuarioDto.apellido,
        email: createUsuarioDto.email,
        telefono: createUsuarioDto.telefono,
        password_hash: createUsuarioDto.password_hash,
        email_verificado_en: createUsuarioDto.email_verificado_en
          ? new Date(createUsuarioDto.email_verificado_en)
          : undefined,
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

    return this.prisma.usuarios.update({
      where: {
        id,
      },
      data: {
        rol_id: updateUsuarioDto.rol_id,
        nombre: updateUsuarioDto.nombre,
        apellido: updateUsuarioDto.apellido,
        email: updateUsuarioDto.email,
        telefono: updateUsuarioDto.telefono,
        password_hash: updateUsuarioDto.password_hash,
        email_verificado_en: updateUsuarioDto.email_verificado_en
          ? new Date(updateUsuarioDto.email_verificado_en)
          : undefined,
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