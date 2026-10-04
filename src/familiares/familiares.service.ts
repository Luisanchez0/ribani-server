import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { CreateFamiliarDto } from './dto/create-familiar.dto.js';
import { UpdateFamiliarDto } from './dto/update-familiar.dto.js';

const SELECT_RELACION = {
  id: true,
  adulto_id: true,
  familiar_id: true,
  parentesco: true,
  es_contacto_principal: true,
  puede_ver_ubicacion: true,
  puede_gestionar_medicamentos: true,
  estado: true,
  created_at: true,
} as const;

const SELECT_USUARIO_ROL = {
  id: true,
  activo: true,
  roles: {
    select: { codigo: true },
  },
} as const;

const ESTADOS_VALIDOS = ['PENDIENTE', 'ACTIVA', 'REVOCADA'] as const;

@Injectable()
export class FamiliaresService {
  constructor(private readonly prisma: PrismaService) {}


  async obtenerAdultosAccesibles(usuarioId: string): Promise<string[]> {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      select: SELECT_USUARIO_ROL,
    });

    if (!usuario) {
      return [];
    }

    if (usuario.roles.codigo === 'ADULTO_MAYOR') {
      return [usuarioId];
    }

    const vinculos = await this.prisma.adulto_familiares.findMany({
      where: { familiar_id: usuarioId },
      select: { adulto_id: true },
    });

    return [...new Set(vinculos.map((vinculo) => vinculo.adulto_id))];
  }

  async create(dto: CreateFamiliarDto) {
    if (dto.familiar_id === dto.adulto_id) {
      throw new ConflictException(
        'El familiar y el adulto mayor no pueden ser el mismo usuario.',
      );
    }

    const [familiar, adulto] = await Promise.all([
      this.prisma.usuarios.findUnique({
        where: { id: dto.familiar_id },
        select: SELECT_USUARIO_ROL,
      }),
      this.prisma.usuarios.findUnique({
        where: { id: dto.adulto_id },
        select: SELECT_USUARIO_ROL,
      }),
    ]);

    if (!familiar) {
      throw new NotFoundException('No se encontró el familiar indicado.');
    }

    if (!adulto) {
      throw new NotFoundException('No se encontró el adulto mayor indicado.');
    }

    if (!familiar.activo || !adulto.activo) {
      throw new ConflictException('Ambos usuarios deben estar activos.');
    }

    if (familiar.roles.codigo !== 'FAMILIAR_ENCARGADO') {
      throw new ConflictException(
        'El usuario indicado como familiar no tiene el rol FAMILIAR_ENCARGADO.',
      );
    }

    if (adulto.roles.codigo !== 'ADULTO_MAYOR') {
      throw new ConflictException(
        'El usuario indicado como adulto mayor no tiene el rol ADULTO_MAYOR.',
      );
    }

    const duplicado = await this.prisma.adulto_familiares.findUnique({
      where: {
        adulto_id_familiar_id: {
          adulto_id: dto.adulto_id,
          familiar_id: dto.familiar_id,
        },
      },
      select: { id: true },
    });

    if (duplicado) {
      throw new ConflictException(
        'Ya existe una relación entre ese familiar y ese adulto mayor.',
      );
    }

    return this.prisma.adulto_familiares.create({
      data: {
        familiar_id: dto.familiar_id,
        adulto_id: dto.adulto_id,
        parentesco: dto.parentesco?.trim() || null,
        puede_ver_ubicacion: dto.puede_ver_ubicacion ?? true,
        puede_gestionar_medicamentos: dto.puede_gestionar_medicamentos ?? true,
        estado: dto.estado ?? 'ACTIVA',
      },
      select: SELECT_RELACION,
    });
  }


  async findAll(usuarioId: string, rolCodigo: string) {
    return this.prisma.adulto_familiares.findMany({
      where:
        rolCodigo === 'ADMINISTRADOR'
          ? {}
          : {
              OR: [{ adulto_id: usuarioId }, { familiar_id: usuarioId }],
            },
      select: SELECT_RELACION,
      orderBy: [{ estado: 'asc' }, { created_at: 'desc' }],
    });
  }

  async misAdultos(usuarioId: string) {
    return this.prisma.adulto_familiares.findMany({
      where: { familiar_id: usuarioId },
      select: {
        ...SELECT_RELACION,
        usuarios_adulto_familiares_adulto_idTousuarios: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            email: true,
            telefono: true,
            activo: true,
          },
        },
      },
      orderBy: [{ estado: 'asc' }, { created_at: 'desc' }],
    });
  }

  async misFamiliares(adultoId: string) {
    return this.prisma.adulto_familiares.findMany({
      where: { adulto_id: adultoId },
      select: {
        ...SELECT_RELACION,
        usuarios_adulto_familiares_familiar_idTousuarios: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            email: true,
            telefono: true,
            activo: true,
          },
        },
      },
      orderBy: [{ estado: 'asc' }, { created_at: 'desc' }],
    });
  }

  private async obtenerRelacion(id: string) {
    const relacion = await this.prisma.adulto_familiares.findUnique({
      where: { id },
      select: SELECT_RELACION,
    });

    if (!relacion) {
      throw new NotFoundException(`No se encontró la relación con ID ${id}.`);
    }

    return relacion;
  }


  private async assertPuedeVerRelacion(
    usuarioId: string,
    relacion: { adulto_id: string; familiar_id: string },
  ): Promise<void> {
    if (
      relacion.adulto_id === usuarioId ||
      relacion.familiar_id === usuarioId
    ) {
      return;
    }

    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      select: SELECT_USUARIO_ROL,
    });

    if (usuario?.roles.codigo === 'ADMINISTRADOR') {
      return;
    }

    throw new ForbiddenException(
      'No tienes permisos para ver esta relación.',
    );
  }

  async findOne(usuarioId: string, id: string) {
    const relacion = await this.obtenerRelacion(id);

    await this.assertPuedeVerRelacion(usuarioId, relacion);

    return relacion;
  }

  async update(
    usuarioId: string,
    rolCodigo: string,
    id: string,
    dto: UpdateFamiliarDto,
  ) {
    const relacion = await this.obtenerRelacion(id);

    await this.assertPuedeVerRelacion(usuarioId, relacion);

    if (rolCodigo !== 'ADMINISTRADOR') {
      throw new ForbiddenException(
        'Solo un administrador puede modificar relaciones.',
      );
    }

    if (dto.estado && !ESTADOS_VALIDOS.includes(dto.estado as never)) {
      throw new BadRequestException(
        `estado debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}.`,
      );
    }

    if (dto.es_contacto_principal === true) {
      const principal = await this.prisma.adulto_familiares.findFirst({
        where: {
          adulto_id: relacion.adulto_id,
          es_contacto_principal: true,
          estado: 'ACTIVA',
          NOT: { id },
        },
        select: { id: true },
      });

      if (principal) {
        throw new ConflictException(
          'El adulto mayor ya tiene un contacto principal activo.',
        );
      }
    }

    try {
      return await this.prisma.adulto_familiares.update({
        where: { id },
        data: {
          ...(dto.parentesco !== undefined
            ? { parentesco: dto.parentesco?.trim() || null }
            : {}),
          ...(dto.es_contacto_principal !== undefined
            ? { es_contacto_principal: dto.es_contacto_principal }
            : {}),
          ...(dto.puede_ver_ubicacion !== undefined
            ? { puede_ver_ubicacion: dto.puede_ver_ubicacion }
            : {}),
          ...(dto.puede_gestionar_medicamentos !== undefined
            ? { puede_gestionar_medicamentos: dto.puede_gestionar_medicamentos }
            : {}),
          ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
        },
        select: SELECT_RELACION,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'El adulto mayor ya tiene un contacto principal activo.',
        );
      }

      throw error;
    }
  }

  async remove(usuarioId: string, rolCodigo: string, id: string) {
    const relacion = await this.obtenerRelacion(id);

    await this.assertPuedeVerRelacion(usuarioId, relacion);

    if (rolCodigo !== 'ADMINISTRADOR') {
      throw new ForbiddenException(
        'Solo un administrador puede revocar relaciones.',
      );
    }

    return this.prisma.adulto_familiares.update({
      where: { id },
      data: { estado: 'REVOCADA' },
      select: SELECT_RELACION,
    });
  }
}
