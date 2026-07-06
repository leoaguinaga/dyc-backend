import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateRequerimientoDto } from './dto/create-requerimiento.dto.js';
import { UpdateRequerimientoDto } from './dto/update-requerimiento.dto.js';
import { QueryRequerimientoDto } from './dto/query-requerimiento.dto.js';
import { ObservarRequerimientoDto } from './dto/revisar-requerimiento.dto.js';
import type { EstadoRequerimiento, Role, TipoRequerimiento } from '../../prisma/types.js';

// Roles that can only see their own requerimientos
const RESTRICTED_ROLES: Role[] = [
  'supervisor',
  'supervisor_civil',
  'supervisor_electrico',
  'pdr',
  'ing_civil',
  'ing_electrico',
  'jefe_sig',
];

// Which tipos a role is allowed to create
const ROLE_TIPOS: Partial<Record<Role, TipoRequerimiento[]>> = {
  supervisor:          ['civil'],
  supervisor_civil:    ['civil'],
  supervisor_electrico:['electrico'],
  pdr:                 ['seguridad'],
  ing_civil:           ['civil'],
  ing_electrico:       ['electrico'],
  jefe_sig:            ['seguridad'],
  logistica:           ['electrico', 'civil', 'seguridad', 'administrativo'],
  gerencia:            [],
  administrador:       ['electrico', 'civil', 'seguridad', 'administrativo'],
};

// Which roles can approve each tipo
const TIPO_APPROVERS: Record<TipoRequerimiento, Role[]> = {
  civil:          ['ing_civil', 'administrador'],
  electrico:      ['ing_electrico', 'administrador'],
  seguridad:      ['jefe_sig', 'administrador'],
  administrativo: ['logistica', 'administrador'],
};

const INCLUDE_BASE = {
  proyecto: { select: { id: true, codigo: true, nombre: true } },
  creadoPor: { select: { id: true, name: true, email: true, role: true } },
  items: true,
  historial: {
    include: { actor: { select: { id: true, name: true, role: true } } },
    orderBy: { creadoEn: 'asc' as const },
  },
  _count: { select: { solicitudes: true } },
} as const;

@Injectable()
export class RequerimientosService {
  constructor(private prisma: PrismaService) {}

  findAll(
    query: QueryRequerimientoDto,
    userId: string,
    userRole: Role,
  ) {
    const where: Record<string, unknown> = {};

    if (query.estado) where.estado = query.estado;
    if (query.proyectoId) where.proyectoId = query.proyectoId;

    if (RESTRICTED_ROLES.includes(userRole)) where.creadoPorId = userId;

    return this.prisma.requerimiento.findMany({
      where,
      include: INCLUDE_BASE,
      orderBy: [{ urgente: 'desc' }, { creadoEn: 'desc' }],
    });
  }

  async findOne(id: string) {
    const r = await this.prisma.requerimiento.findUnique({
      where: { id },
      include: {
        ...INCLUDE_BASE,
        solicitudes: {
          select: {
            id: true,
            codigo: true,
            estado: true,
            creadoEn: true,
          },
        },
      },
    });
    if (!r) throw new NotFoundException(`Requerimiento ${id} no encontrado`);
    return r;
  }

  async create(dto: CreateRequerimientoDto, userId: string, userRole: Role) {
    const allowed = ROLE_TIPOS[userRole] ?? [];
    if (!allowed.includes(dto.tipo)) {
      throw new ForbiddenException(
        `El rol "${userRole}" no puede crear requerimientos de tipo "${dto.tipo}"`,
      );
    }

    const codigo = await this.generateCodigo();
    return this.prisma.requerimiento.create({
      data: {
        codigo,
        nombre: dto.nombre,
        proyectoId: dto.proyectoId,
        creadoPorId: userId,
        tipo: dto.tipo,
        urgente: dto.urgente ?? false,
        nota: dto.nota,
        fechaEntregaRequerida: dto.fechaEntregaRequerida ? new Date(dto.fechaEntregaRequerida) : undefined,
        items: {
          create: dto.items.map((i) => ({
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            unidad: i.unidad ?? 'und',
            nota: i.nota,
          })),
        },
      },
      include: INCLUDE_BASE,
    });
  }

  async actualizar(id: string, dto: UpdateRequerimientoDto, userId: string, userRole: Role) {
    const r = await this.findOne(id);
    if (r.estado !== 'borrador' && r.estado !== 'observado')
      throw new BadRequestException('Solo se puede editar un requerimiento en borrador u observado');
    if (r.creadoPorId !== userId && userRole !== 'administrador')
      throw new BadRequestException('Solo el creador puede editar este requerimiento');

    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.requerimientoItem.deleteMany({ where: { requerimientoId: id } });
      }
      return tx.requerimiento.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          urgente: dto.urgente,
          nota: dto.nota,
          fechaEntregaRequerida: dto.fechaEntregaRequerida ? new Date(dto.fechaEntregaRequerida) : undefined,
          items: dto.items
            ? {
                create: dto.items.map((i) => ({
                  descripcion: i.descripcion,
                  cantidad: i.cantidad,
                  unidad: i.unidad ?? 'und',
                  nota: i.nota,
                })),
              }
            : undefined,
        },
        include: INCLUDE_BASE,
      });
    });
  }

  async enviar(id: string, userId: string, userRole: Role) {
    const r = await this.findOne(id);
    if (r.estado !== 'borrador' && r.estado !== 'observado')
      throw new BadRequestException('Solo se pueden enviar requerimientos en borrador u observados');
    if (r.creadoPorId !== userId && userRole !== 'administrador')
      throw new BadRequestException('Solo el creador puede enviar este requerimiento');
    if (r.items.length === 0)
      throw new BadRequestException('El requerimiento debe tener al menos un ítem');

    // Auto-aprobación: si quien envía ya es aprobador de este tipo (ej. ing_civil enviando
    // un req civil, logística enviando uno administrativo), pedirle que apruebe su propio
    // requerimiento sería un re-proceso inútil.
    const autoAprueba = TIPO_APPROVERS[r.tipo].includes(userRole);
    const nuevoEstado: EstadoRequerimiento = autoAprueba ? 'aprobado' : 'enviado';

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.requerimiento.update({
        where: { id },
        data: { estado: nuevoEstado, notaRevision: null },
        include: INCLUDE_BASE,
      });
      await tx.requerimientoHistorial.create({
        data: {
          requerimientoId: id,
          estado: nuevoEstado,
          actorId: userId,
          actorRole: userRole,
          nota: autoAprueba
            ? 'Autoaprobado: el solicitante también es aprobador de este tipo'
            : undefined,
        },
      });
      return actualizado;
    });
  }

  async aprobar(id: string, userId: string, userRole: Role) {
    const r = await this.findOne(id);
    if (r.estado !== 'enviado')
      throw new BadRequestException('Solo se pueden aprobar requerimientos enviados');

    const approvers = TIPO_APPROVERS[r.tipo];
    if (!approvers.includes(userRole)) {
      throw new ForbiddenException(
        `El rol "${userRole}" no puede aprobar requerimientos de tipo "${r.tipo}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.requerimiento.update({
        where: { id },
        data: { estado: 'aprobado', notaRevision: null },
        include: INCLUDE_BASE,
      });
      await tx.requerimientoHistorial.create({
        data: { requerimientoId: id, estado: 'aprobado', actorId: userId, actorRole: userRole },
      });
      return actualizado;
    });
  }

  async observar(id: string, dto: ObservarRequerimientoDto, userId: string, userRole: Role) {
    const r = await this.findOne(id);
    if (r.estado !== 'enviado')
      throw new BadRequestException('Solo se pueden observar requerimientos enviados');

    const approvers = TIPO_APPROVERS[r.tipo];
    if (!approvers.includes(userRole)) {
      throw new ForbiddenException(
        `El rol "${userRole}" no puede observar requerimientos de tipo "${r.tipo}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.requerimiento.update({
        where: { id },
        data: { estado: 'observado', notaRevision: dto.notaRevision },
        include: INCLUDE_BASE,
      });
      await tx.requerimientoHistorial.create({
        data: {
          requerimientoId: id,
          estado: 'observado',
          actorId: userId,
          actorRole: userRole,
          nota: dto.notaRevision,
        },
      });
      return actualizado;
    });
  }

  private async generateCodigo(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.requerimiento.count({
      where: { creadoEn: { gte: new Date(`${year}-01-01`) } },
    });
    return `REQ-${year}-${String(count + 1).padStart(4, '0')}`;
  }
}
