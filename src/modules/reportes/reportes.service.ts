import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QueryReporteRangoDto } from './dto/query-reporte.dto.js';

function rangoFecha(query: QueryReporteRangoDto) {
  if (!query.desde && !query.hasta) return undefined;
  return {
    gte: query.desde ? new Date(query.desde) : undefined,
    lte: query.hasta ? new Date(query.hasta) : undefined,
  };
}

function mesDe(fecha: Date) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class ReportesService {
  constructor(private prisma: PrismaService) {}

  async gastoPorProyecto(query: QueryReporteRangoDto) {
    const ocs = await this.prisma.ordenCompra.findMany({
      where: { creadoEn: rangoFecha(query) },
      select: {
        montoTotal: true,
        proyecto: { select: { id: true, codigo: true, nombre: true } },
      },
    });

    const porProyecto = new Map<
      string,
      { proyecto: { id: string; codigo: string | null; nombre: string }; totalOcs: number; montoTotal: number }
    >();
    for (const oc of ocs) {
      const entry = porProyecto.get(oc.proyecto.id) ?? {
        proyecto: oc.proyecto,
        totalOcs: 0,
        montoTotal: 0,
      };
      entry.totalOcs += 1;
      entry.montoTotal += Number(oc.montoTotal);
      porProyecto.set(oc.proyecto.id, entry);
    }

    return Array.from(porProyecto.values()).sort((a, b) => b.montoTotal - a.montoTotal);
  }

  async ocsPorProveedor(query: QueryReporteRangoDto) {
    const ocs = await this.prisma.ordenCompra.findMany({
      where: { creadoEn: rangoFecha(query) },
      select: {
        montoTotal: true,
        proveedor: { select: { id: true, razonSocial: true } },
      },
    });

    const porProveedor = new Map<
      string,
      { proveedor: { id: string; razonSocial: string }; totalOcs: number; montoTotal: number }
    >();
    for (const oc of ocs) {
      const entry = porProveedor.get(oc.proveedor.id) ?? {
        proveedor: oc.proveedor,
        totalOcs: 0,
        montoTotal: 0,
      };
      entry.totalOcs += 1;
      entry.montoTotal += Number(oc.montoTotal);
      porProveedor.set(oc.proveedor.id, entry);
    }

    return Array.from(porProveedor.values()).sort((a, b) => b.montoTotal - a.montoTotal);
  }

  async pagosPorPeriodo(query: QueryReporteRangoDto) {
    const pagos = await this.prisma.pago.findMany({
      where: {
        fechaProgramada: rangoFecha(query),
        estado: { in: ['pendiente', 'pagado'] },
      },
      select: { estado: true, monto: true, fechaProgramada: true },
    });

    const hoy = new Date();
    const porPeriodo = new Map<string, { periodo: string; pagado: number; pendiente: number; vencido: number }>();
    for (const p of pagos) {
      const periodo = mesDe(p.fechaProgramada);
      const entry = porPeriodo.get(periodo) ?? { periodo, pagado: 0, pendiente: 0, vencido: 0 };
      const monto = Number(p.monto);
      if (p.estado === 'pagado') entry.pagado += monto;
      else if (p.fechaProgramada < hoy) entry.vencido += monto;
      else entry.pendiente += monto;
      porPeriodo.set(periodo, entry);
    }

    return Array.from(porPeriodo.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
  }
}
