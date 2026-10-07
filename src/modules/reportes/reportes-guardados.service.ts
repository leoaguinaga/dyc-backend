import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';
import { getCampoMeta, getEntidadMeta } from './catalogo/index.js';
import type { QueryReporteDinamicoDto } from './dto/query-reporte-dinamico.dto.js';
import type {
  CreateReporteGuardadoDto,
  UpdateReporteGuardadoDto,
} from './dto/reporte-guardado.dto.js';

const INCLUDE = { creadoPor: { select: { id: true, name: true } } } as const;

@Injectable()
export class ReportesGuardadosService {
  constructor(private prisma: PrismaService) {}

  /** Los propios y los que otros compartieron. */
  listar(user: AuthenticatedUser) {
    return this.prisma.reporteGuardado.findMany({
      where: { OR: [{ creadoPorId: user.id }, { compartido: true }] },
      include: INCLUDE,
      orderBy: { nombre: 'asc' },
    });
  }

  async crear(dto: CreateReporteGuardadoDto, user: AuthenticatedUser) {
    this.validarQuery(dto.query);
    return this.prisma.reporteGuardado.create({
      data: {
        nombre: dto.nombre.trim(),
        descripcion: dto.descripcion?.trim() || null,
        query: this.aJson(dto.query),
        compartido: dto.compartido ?? false,
        creadoPorId: user.id,
      },
      include: INCLUDE,
    });
  }

  async actualizar(
    id: string,
    dto: UpdateReporteGuardadoDto,
    user: AuthenticatedUser,
  ) {
    await this.propio(id, user);
    if (dto.query) this.validarQuery(dto.query);
    return this.prisma.reporteGuardado.update({
      where: { id },
      data: {
        nombre: dto.nombre?.trim(),
        descripcion:
          dto.descripcion === undefined
            ? undefined
            : dto.descripcion.trim() || null,
        query: dto.query ? this.aJson(dto.query) : undefined,
        compartido: dto.compartido,
      },
      include: INCLUDE,
    });
  }

  async eliminar(id: string, user: AuthenticatedUser) {
    await this.propio(id, user);
    await this.prisma.reporteGuardado.delete({ where: { id } });
    return { success: true };
  }

  /** Solo quien lo creó (o TI) puede cambiarlo; un compartido ajeno es de solo lectura. */
  private async propio(id: string, user: AuthenticatedUser) {
    const reporte = await this.prisma.reporteGuardado.findUnique({
      where: { id },
    });
    if (!reporte || (reporte.creadoPorId !== user.id && !reporte.compartido)) {
      throw new NotFoundException(`Reporte ${id} no encontrado`);
    }
    if (reporte.creadoPorId !== user.id && user.role !== 'admin_ti') {
      throw new ForbiddenException(
        'Solo quien guardó el reporte puede modificarlo',
      );
    }
    return reporte;
  }

  /** Falla si la consulta usa una entidad o campos que ya no existen en el catálogo. */
  private validarQuery(query: QueryReporteDinamicoDto) {
    getEntidadMeta(query.entidad);
    const campos = [
      ...(query.filtros ?? []).map((f) => f.campo),
      ...(query.agruparPor ?? []),
      ...(query.metricas ?? []).map((m) => m.campo),
      ...(query.columnas ?? []),
    ];
    for (const campo of campos) getCampoMeta(query.entidad, campo);
  }

  private aJson(query: QueryReporteDinamicoDto) {
    return JSON.parse(JSON.stringify(query)) as object;
  }
}
