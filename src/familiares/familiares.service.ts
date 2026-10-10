import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

import { CompletarInvitacionFamiliarDto } from './dto/completar-invitacion-familiar.dto.js';
import { CreateFamiliarDto } from './dto/create-familiar.dto.js';
import { CrearInvitacionFamiliarDto } from './dto/crear-invitacion-familiar.dto.js';
import { UpdateFamiliarDto } from './dto/update-familiar.dto.js';

const SELECT_USUARIO_ADULTO = {
  id: true,
  nombre: true,
  apellido: true,
  email: true,
  telefono: true,
  activo: true,
  roles: {
    select: { codigo: true },
  },
} as const;

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


  /**
   * Invita a un adulto mayor por su correo electrónico y crea el vínculo en
   * estado PENDIENTE.
   *
   * - Si el caller es FAMILIAR_ENCARGADO, el familiar vinculado es él mismo
   *   (ID tomado del token) y `dto.familiar_id` no debe venir.
   * - Si el caller es ADMINISTRADOR, debe indicar `dto.familiar_id`.
   * - Si no existe un usuario con ese email, crea la cuenta inactiva con rol
   *   ADULTO_MAYOR y sin contraseña (se define al completar la invitación).
   * - Si el email ya pertenece a un usuario activo con otro rol, se rechaza.
   */
  async invitarPorEmail(
    callerId: string,
    callerRolCodigo: string,
    dto: CrearInvitacionFamiliarDto,
  ) {
    const esAdmin = callerRolCodigo === 'ADMINISTRADOR';
    const esFamiliar = callerRolCodigo === 'FAMILIAR_ENCARGADO';

    if (!esAdmin && !esFamiliar) {
      throw new ForbiddenException(
        'Solo un familiar encargado o un administrador puede invitar a un adulto mayor.',
      );
    }

    const familiarId = esFamiliar ? callerId : dto.familiar_id;

    if (!familiarId) {
      throw new BadRequestException(
        'Un administrador debe indicar el familiar_id del familiar encargado que quedará vinculado.',
      );
    }

    if (esFamiliar && dto.familiar_id && dto.familiar_id !== callerId) {
      throw new BadRequestException(
        'No puedes crear una invitación a nombre de otro familiar.',
      );
    }

    const email = dto.adulto_email.trim().toLowerCase();

    const familiar = await this.prisma.usuarios.findUnique({
      where: { id: familiarId },
      select: SELECT_USUARIO_ROL,
    });

    if (!familiar) {
      throw new NotFoundException('No se encontró el familiar indicado.');
    }

    if (!familiar.activo) {
      throw new ConflictException('El familiar indicado está inactivo.');
    }

    if (familiar.roles.codigo !== 'FAMILIAR_ENCARGADO') {
      throw new ConflictException(
        'El usuario indicado como familiar no tiene el rol FAMILIAR_ENCARGADO.',
      );
    }

    const adultoExistente = await this.prisma.usuarios.findUnique({
      where: { email },
      select: SELECT_USUARIO_ADULTO,
    });

    if (adultoExistente?.id === familiarId) {
      throw new ConflictException(
        'El familiar y el adulto mayor no pueden ser el mismo usuario.',
      );
    }

    if (
      adultoExistente &&
      (adultoExistente.roles.codigo !== 'ADULTO_MAYOR' || !adultoExistente.activo)
    ) {
      throw new ConflictException(
        adultoExistente.roles.codigo !== 'ADULTO_MAYOR'
          ? 'El correo indicado pertenece a un usuario que no es adulto mayor.'
          : 'El adulto mayor indicado está inactivo.',
      );
    }

    // Evita duplicar la invitación: si ya existe ACTIVA se rechaza; si existe
    // PENDIENTE se repite para volver a notificar al adulto.
    const vinculoExistente = await this.prisma.adulto_familiares.findFirst({
      where: {
        familiar_id: familiarId,
        ...(adultoExistente ? { adulto_id: adultoExistente.id } : {}),
        estado: { in: ['ACTIVA', 'PENDIENTE'] },
      },
      select: {
        id: true,
        estado: true,
        usuarios_adulto_familiares_adulto_idTousuarios: {
          select: { email: true },
        },
      },
    });

    if (
      vinculoExistente &&
      vinculoExistente.estado !== 'PENDIENTE' &&
      vinculoExistente.usuarios_adulto_familiares_adulto_idTousuarios.email ===
        email
    ) {
      throw new ConflictException(
        'Ya existe un vínculo ACTIVA entre ese familiar y ese adulto mayor.',
      );
    }

    let adultoId: string;
    let esNuevaCuenta = false;

    if (adultoExistente) {
      adultoId = adultoExistente.id;
    } else {
      const rolAdulto = await this.prisma.roles.findUnique({
        where: { codigo: 'ADULTO_MAYOR' },
        select: { id: true, activo: true },
      });

      if (!rolAdulto || !rolAdulto.activo) {
        throw new ConflictException('El rol ADULTO_MAYOR no está disponible.');
      }

      // Cuenta sin contraseña: se define al completar la invitación.
      const passwordTemporal = await bcrypt.hash(randomUUID(), 12);

      const nuevoAdulto = await this.prisma.usuarios.create({
        data: {
          rol_id: rolAdulto.id,
          nombre: dto.adulto_nombre?.trim() || 'Invitado',
          apellido: dto.adulto_apellido?.trim() || 'RIBANI',
          email,
          telefono: dto.adulto_telefono?.trim() || null,
          password_hash: passwordTemporal,
          activo: false,
        },
        select: { id: true },
      });

      adultoId = nuevoAdulto.id;
      esNuevaCuenta = true;
    }

    const vinculo = await this.prisma.adulto_familiares.upsert({
      where: {
        adulto_id_familiar_id: {
          adulto_id: adultoId,
          familiar_id: familiarId,
        },
      },
      create: {
        familiar_id: familiarId,
        adulto_id: adultoId,
        parentesco: dto.parentesco?.trim() || null,
        puede_ver_ubicacion: dto.puede_ver_ubicacion ?? true,
        puede_gestionar_medicamentos: dto.puede_gestionar_medicamentos ?? true,
        estado: 'PENDIENTE',
      },
      update: {
        estado: 'PENDIENTE',
        parentesco: dto.parentesco?.trim() || null,
        puede_ver_ubicacion: dto.puede_ver_ubicacion ?? true,
        puede_gestionar_medicamentos: dto.puede_gestionar_medicamentos ?? true,
      },
      select: SELECT_RELACION,
    });

    return {
      ...vinculo,
      adulto: adultoExistente
        ? {
            id: adultoExistente.id,
            nombre: adultoExistente.nombre,
            apellido: adultoExistente.apellido,
            email: adultoExistente.email,
          }
        : {
            id: adultoId,
            nombre: dto.adulto_nombre?.trim() || 'Invitado',
            apellido: dto.adulto_apellido?.trim() || 'RIBANI',
            email,
            esNuevaCuenta: true,
          },
      esNuevaCuenta,
      mensaje: esNuevaCuenta
        ? 'Invitación creada. El adulto debe completar su registro para activar su cuenta y aceptar el vínculo.'
        : 'Invitación enviada. El adulto mayor debe aceptar el vínculo desde su cuenta.',
    };
  }

  /**
   * Completa el registro del adulto invitado: define su contraseña, activa su
   * cuenta y acepta el vínculo PENDIENTE dirigido a su correo.
   */
  async completarInvitacion(dto: CompletarInvitacionFamiliarDto) {
    const email = dto.email.trim().toLowerCase();

    const adulto = await this.prisma.usuarios.findUnique({
      where: { email },
      include: { roles: { select: { codigo: true } } },
    });

    if (!adulto) {
      throw new NotFoundException('No hay una invitación pendiente para ese correo.');
    }

    if (adulto.roles.codigo !== 'ADULTO_MAYOR') {
      throw new ConflictException('El correo indicado no corresponde a una invitación de adulto mayor.');
    }

    if (adulto.activo) {
      throw new ConflictException('Esta cuenta ya está activa. Inicia sesión para aceptar o rechazar la invitación.');
    }

    const invitacionPendiente = await this.prisma.adulto_familiares.findFirst({
      where: {
        adulto_id: adulto.id,
        estado: 'PENDIENTE',
      },
      select: { id: true },
      orderBy: { created_at: 'desc' },
    });

    if (!invitacionPendiente) {
      throw new NotFoundException('No hay una invitación pendiente para ese correo.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.usuarios.update({
        where: { id: adulto.id },
        data: {
          password_hash: passwordHash,
          activo: true,
          nombre: dto.nombre?.trim() || adulto.nombre,
          apellido: dto.apellido?.trim() || adulto.apellido,
          telefono: dto.telefono?.trim() || adulto.telefono,
        },
      });

      await tx.adulto_familiares.update({
        where: { id: invitacionPendiente.id },
        data: { estado: 'ACTIVA' },
      });
    });

    return {
      adulto_id: adulto.id,
      email: adulto.email,
      mensaje: 'Registro completado. Tu cuenta está activa y el vínculo quedó ACTIVA.',
    };
  }

  /**
   * El adulto mayor (autenticado) acepta un vínculo PENDIENTE dirigido a él.
   */
  async aceptarInvitacion(adultoId: string, rolCodigo: string, id: string) {
    if (rolCodigo !== 'ADULTO_MAYOR') {
      throw new ForbiddenException(
        'Solo el adulto mayor puede aceptar o rechazar su invitación.',
      );
    }

    const relacion = await this.prisma.adulto_familiares.findUnique({
      where: { id },
      select: {
        id: true,
        adulto_id: true,
        estado: true,
        familiar_id: true,
      },
    });

    if (!relacion) {
      throw new NotFoundException(
        `No se encontró la invitación con ID ${id}.`,
      );
    }

    if (relacion.adulto_id !== adultoId) {
      throw new ForbiddenException('No puedes aceptar la invitación de otro adulto mayor.');
    }

    if (relacion.estado !== 'PENDIENTE') {
      throw new ConflictException(
        `La invitación no está PENDIENTE (estado actual: ${relacion.estado}).`,
      );
    }

    return this.prisma.adulto_familiares.update({
      where: { id },
      data: { estado: 'ACTIVA' },
      select: SELECT_RELACION,
    });
  }

  /**
   * El adulto mayor (autenticado) rechaza un vínculo PENDIENTE dirigido a él.
   */
  async rechazarInvitacion(adultoId: string, rolCodigo: string, id: string) {
    if (rolCodigo !== 'ADULTO_MAYOR') {
      throw new ForbiddenException(
        'Solo el adulto mayor puede aceptar o rechazar su invitación.',
      );
    }

    const relacion = await this.prisma.adulto_familiares.findUnique({
      where: { id },
      select: {
        id: true,
        adulto_id: true,
        estado: true,
        familiar_id: true,
      },
    });

    if (!relacion) {
      throw new NotFoundException(
        `No se encontró la invitación con ID ${id}.`,
      );
    }

    if (relacion.adulto_id !== adultoId) {
      throw new ForbiddenException('No puedes rechazar la invitación de otro adulto mayor.');
    }

    if (relacion.estado !== 'PENDIENTE') {
      throw new ConflictException(
        `La invitación no está PENDIENTE (estado actual: ${relacion.estado}).`,
      );
    }

    return this.prisma.adulto_familiares.update({
      where: { id },
      data: { estado: 'REVOCADA' },
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

  /** Invitaciones PENDIENTES dirigidas al adulto autenticado. */
  async invitacionesPendientes(adultoId: string) {
    return this.prisma.adulto_familiares.findMany({
      where: { adulto_id: adultoId, estado: 'PENDIENTE' },
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
      orderBy: { created_at: 'desc' },
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
