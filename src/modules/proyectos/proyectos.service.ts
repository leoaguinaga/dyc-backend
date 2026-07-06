import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Role } from '../../prisma/types.js';
import { CreateProyectoDto } from './dto/create-proyecto.dto.js';
import { UpdateProyectoDto } from './dto/update-proyecto.dto.js';
import { CreateHitoDto } from './dto/create-hito.dto.js';
import { UpdateHitoDto } from './dto/update-hito.dto.js';

@Injectable()
export class ProyectosService {
  constructor(private prisma: PrismaService) {}

  private readonly includeBase = {
    cliente: { select: { id: true, razonSocial: true, nombreComercial: true } },
    parent: { select: { id: true, nombre: true, codigo: true } },
    subproyectos: {
      select: { id: true, nombre: true, codigo: true, estado: true },
    },
    supervisores: { include: { user: { select: { id: true, name: true } } } },
    coordinadorEmpresa: { select: { id: true, nombre: true, cargo: true } },
    coordinadorCliente: { select: { id: true, nombre: true, cargo: true } },
    ejecutor: { select: { id: true, nombre: true, cargo: true } },
    prevencionista: { select: { id: true, nombre: true, cargo: true } },
  } as const;

  findAll(userId: string, userRole: Role) {
    if (userRole === 'supervisor') {
      return this.prisma.proyecto.findMany({
        where: { supervisores: { some: { userId } } },
        include: this.includeBase,
      });
    }
    return this.prisma.proyecto.findMany({ include: this.includeBase });
  }

  async findOne(id: string, userId: string, userRole: Role) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id },
      include: {
        ...this.includeBase,
        supervisores: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        trabajadores: { include: { trabajador: true } },
        hitos: {
          include: {
            responsable: { select: { id: true, nombre: true, cargo: true } },
          },
          orderBy: { fechaProgramada: 'asc' },
        },
      },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto ${id} no encontrado`);

    if (
      userRole === 'supervisor' &&
      !proyecto.supervisores.some((s) => s.userId === userId)
    ) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }

    return proyecto;
  }

  private toDate(d?: string): Date | undefined {
    return d ? new Date(d) : undefined;
  }

  async create(dto: CreateProyectoDto) {
    const {
      clienteId,
      coordinadorClienteId,
      coordinadorEmpresaId,
      prevencionistaId,
      ejecutorId,
      parentId,
      fechaInicio,
      fechaFin,
      fechaInicioReal,
      fechaFinReal,
      ...rest
    } = dto;

    return this.prisma.$transaction(async (tx) => {
      const proyecto = await tx.proyecto.create({
        data: {
          ...rest,
          fechaInicio: this.toDate(fechaInicio),
          fechaFin: this.toDate(fechaFin),
          fechaInicioReal: this.toDate(fechaInicioReal),
          fechaFinReal: this.toDate(fechaFinReal),
          ...(parentId && { parent: { connect: { id: parentId } } }),
          ...(clienteId && { cliente: { connect: { id: clienteId } } }),
          ...(coordinadorClienteId && {
            coordinadorCliente: { connect: { id: coordinadorClienteId } },
          }),
          ...(coordinadorEmpresaId && {
            coordinadorEmpresa: { connect: { id: coordinadorEmpresaId } },
          }),
          ...(ejecutorId && { ejecutor: { connect: { id: ejecutorId } } }),
          ...(prevencionistaId && {
            prevencionista: { connect: { id: prevencionistaId } },
          }),
        },
        include: this.includeBase,
      });

      return proyecto;
    });
  }

  async update(id: string, dto: UpdateProyectoDto) {
    await this.assertExists(id);
    const {
      clienteId,
      coordinadorClienteId,
      coordinadorEmpresaId,
      prevencionistaId,
      ejecutorId,
      parentId,
      fechaInicio,
      fechaFin,
      fechaInicioReal,
      fechaFinReal,
      ...rest
    } = dto;
    return this.prisma.proyecto.update({
      where: { id },
      data: {
        ...rest,
        ...(fechaInicio !== undefined && {
          fechaInicio: this.toDate(fechaInicio),
        }),
        ...(fechaFin !== undefined && { fechaFin: this.toDate(fechaFin) }),
        ...(fechaInicioReal !== undefined && {
          fechaInicioReal: this.toDate(fechaInicioReal),
        }),
        ...(fechaFinReal !== undefined && {
          fechaFinReal: this.toDate(fechaFinReal),
        }),
        ...(parentId !== undefined && {
          parent: parentId
            ? { connect: { id: parentId } }
            : { disconnect: true },
        }),
        ...(clienteId !== undefined && {
          cliente: clienteId
            ? { connect: { id: clienteId } }
            : { disconnect: true },
        }),
        ...(coordinadorClienteId !== undefined && {
          coordinadorCliente: coordinadorClienteId
            ? { connect: { id: coordinadorClienteId } }
            : { disconnect: true },
        }),
        ...(coordinadorEmpresaId !== undefined && {
          coordinadorEmpresa: coordinadorEmpresaId
            ? { connect: { id: coordinadorEmpresaId } }
            : { disconnect: true },
        }),
        ...(ejecutorId !== undefined && {
          ejecutor: ejecutorId
            ? { connect: { id: ejecutorId } }
            : { disconnect: true },
        }),
        ...(prevencionistaId !== undefined && {
          prevencionista: prevencionistaId
            ? { connect: { id: prevencionistaId } }
            : { disconnect: true },
        }),
      },
      include: this.includeBase,
    });
  }

  async addSupervisor(proyectoId: string, userId: string) {
    await this.assertExists(proyectoId);
    return this.prisma.proyectoSupervisor.create({
      data: { proyectoId, userId },
    });
  }

  async removeSupervisor(proyectoId: string, userId: string) {
    return this.prisma.proyectoSupervisor.delete({
      where: { proyectoId_userId: { proyectoId, userId } },
    });
  }

  // ── Hitos ──────────────────────────────────────────────────────────────────

  async findHitos(proyectoId: string) {
    await this.assertExists(proyectoId);
    return this.prisma.hito.findMany({
      where: { proyectoId },
      include: {
        responsable: { select: { id: true, nombre: true, cargo: true } },
      },
      orderBy: { fechaProgramada: 'asc' },
    });
  }

  async createHito(proyectoId: string, dto: CreateHitoDto) {
    await this.assertExists(proyectoId);
    return this.prisma.hito.create({
      data: {
        proyectoId,
        nombre: dto.nombre,
        fechaProgramada: new Date(dto.fechaProgramada),
        evidencia: dto.evidencia,
        cumplimiento: dto.cumplimiento,
        responsableId: dto.responsableId,
        notas: dto.notas,
      },
      include: {
        responsable: { select: { id: true, nombre: true, cargo: true } },
      },
    });
  }

  async updateHito(proyectoId: string, hitoId: string, dto: UpdateHitoDto) {
    await this.assertExists(proyectoId);
    const hito = await this.prisma.hito.findFirst({
      where: { id: hitoId, proyectoId },
    });
    if (!hito) throw new NotFoundException(`Hito ${hitoId} no encontrado`);

    return this.prisma.hito.update({
      where: { id: hitoId },
      data: {
        ...dto,
        ...(dto.fechaProgramada && {
          fechaProgramada: new Date(dto.fechaProgramada),
        }),
      },
      include: {
        responsable: { select: { id: true, nombre: true, cargo: true } },
      },
    });
  }

  async deleteHito(proyectoId: string, hitoId: string) {
    await this.assertExists(proyectoId);
    const hito = await this.prisma.hito.findFirst({
      where: { id: hitoId, proyectoId },
    });
    if (!hito) throw new NotFoundException(`Hito ${hitoId} no encontrado`);
    return this.prisma.hito.delete({ where: { id: hitoId } });
  }

  private async assertExists(id: string) {
    const proyecto = await this.prisma.proyecto.findUnique({ where: { id } });
    if (!proyecto) throw new NotFoundException(`Proyecto ${id} no encontrado`);
  }
}
