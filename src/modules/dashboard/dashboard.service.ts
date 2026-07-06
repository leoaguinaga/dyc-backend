import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function ultimosNMeses(n: number): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = [];
  const hoy = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth(), label: MESES_LABEL[d.getMonth()] });
  }
  return out;
}

function ultimasNSemanas(n: number): { start: Date; end: Date; label: string }[] {
  const out: { start: Date; end: Date; label: string }[] = [];
  const finSemanaActual = new Date();
  finSemanaActual.setDate(finSemanaActual.getDate() + 1);
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date(finSemanaActual.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    out.push({ start, end, label: `S${n - i}` });
  }
  return out;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async resumen() {
    const [proyectos, requerimientos, cotizaciones, ordenesCompra, inventario] = await Promise.all([
      this.proyectos(),
      this.requerimientos(),
      this.cotizaciones(),
      this.ordenesCompra(),
      this.inventario(),
    ]);

    return { proyectos, requerimientos, cotizaciones, ordenesCompra, inventario };
  }

  async finanzas() {
    const meses = ultimosNMeses(6);
    const desde = new Date(meses[0].year, meses[0].month, 1);

    const pagos = await this.prisma.pago.findMany({
      where: {
        estado: { in: ['pendiente', 'pagado'] },
        OR: [{ fechaProgramada: { gte: desde } }, { fechaPagoReal: { gte: desde } }],
      },
      select: { estado: true, monto: true, fechaProgramada: true, fechaPagoReal: true },
    });

    const hoy = new Date();
    const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
    const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    let totalPendiente = 0;
    let totalVencido = 0;
    let proximos7dias = 0;
    let pagadoMes = 0;
    for (const p of pagos) {
      const monto = Number(p.monto);
      if (p.estado === 'pendiente') {
        totalPendiente += monto;
        if (p.fechaProgramada < hoy) totalVencido += monto;
        else if (p.fechaProgramada <= en7dias) proximos7dias += monto;
      } else if (p.estado === 'pagado' && p.fechaPagoReal && p.fechaPagoReal >= inicioMesActual) {
        pagadoMes += monto;
      }
    }

    const montoPorMes = meses.map(({ year, month, label }) => {
      let pagado = 0;
      let pendiente = 0;
      let vencido = 0;
      for (const p of pagos) {
        if (p.estado === 'pagado' && p.fechaPagoReal) {
          if (p.fechaPagoReal.getFullYear() === year && p.fechaPagoReal.getMonth() === month) pagado += Number(p.monto);
        } else if (p.estado === 'pendiente') {
          if (p.fechaProgramada.getFullYear() === year && p.fechaProgramada.getMonth() === month) {
            if (p.fechaProgramada < hoy) vencido += Number(p.monto);
            else pendiente += Number(p.monto);
          }
        }
      }
      return { mes: label, pagado, pendiente, vencido };
    });

    return { totalPendiente, totalVencido, proximos7dias, pagadoMes, montoPorMes };
  }

  private async proyectos() {
    const proyectos = await this.prisma.proyecto.findMany({ select: { estado: true } });
    const porEstado = { planificacion: 0, ejecucion: 0, cierre: 0, liquidada: 0 };
    for (const p of proyectos) porEstado[p.estado]++;

    const hoy = new Date();
    const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [hitosProximos, hitosIncumplidos] = await Promise.all([
      this.prisma.hito.count({
        where: { cumplimiento: { in: ['no', 'programado'] }, fechaProgramada: { gte: hoy, lte: en7dias } },
      }),
      this.prisma.hito.count({ where: { cumplimiento: 'no' } }),
    ]);

    return { total: proyectos.length, porEstado, hitosProximos7dias: hitosProximos, hitosIncumplidos };
  }

  private async requerimientos() {
    const semanas = ultimasNSemanas(8);
    const desde = semanas[0].start;

    const [creados, aprobados, pendientes, urgentesPendientes] = await Promise.all([
      this.prisma.requerimiento.findMany({ where: { creadoEn: { gte: desde } }, select: { creadoEn: true } }),
      this.prisma.requerimientoHistorial.findMany({
        where: { estado: 'aprobado', creadoEn: { gte: desde } },
        select: { creadoEn: true, requerimientoId: true },
        distinct: ['requerimientoId'],
        orderBy: { creadoEn: 'asc' },
      }),
      this.prisma.requerimiento.count({ where: { estado: 'enviado' } }),
      this.prisma.requerimiento.count({ where: { estado: 'enviado', urgente: true } }),
    ]);

    const tendenciaSemanal = semanas.map(({ start, end, label }) => ({
      semana: label,
      creados: creados.filter((r) => r.creadoEn >= start && r.creadoEn < end).length,
      aprobados: aprobados.filter((a) => a.creadoEn >= start && a.creadoEn < end).length,
    }));

    const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const aprobadosRecientes = await this.prisma.requerimientoHistorial.findMany({
      where: { estado: 'aprobado', creadoEn: { gte: hace30dias } },
      select: { creadoEn: true, requerimiento: { select: { creadoEn: true } } },
      distinct: ['requerimientoId'],
    });
    const tiempoPromedioDias = aprobadosRecientes.length
      ? aprobadosRecientes.reduce(
          (s, a) => s + (a.creadoEn.getTime() - a.requerimiento.creadoEn.getTime()) / (24 * 60 * 60 * 1000),
          0,
        ) / aprobadosRecientes.length
      : null;

    return {
      tendenciaSemanal,
      pendientesAprobacion: pendientes,
      urgentesPendientes,
      tiempoPromedioAprobacionDias: tiempoPromedioDias !== null ? Number(tiempoPromedioDias.toFixed(1)) : null,
    };
  }

  private async cotizaciones() {
    const solicitudes = await this.prisma.solicitudCotizacion.findMany({
      select: { estado: true, actualizadoEn: true },
    });
    const funnelMap = { borrador: 0, enviada: 0, cotizada: 0, seleccionada: 0, aprobada: 0 };
    for (const s of solicitudes) {
      if (s.estado === 'aprobada_solicitante' || s.estado === 'aprobada_gerencia') funnelMap.aprobada++;
      else if (s.estado in funnelMap) funnelMap[s.estado as keyof typeof funnelMap]++;
    }
    const funnelPorEstado = Object.entries(funnelMap).map(([etapa, value]) => ({ etapa, value }));
    const solicitudesEnCurso = solicitudes.filter(
      (s) => s.estado !== 'aprobada_gerencia' && s.estado !== 'cancelada',
    ).length;

    const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const estancadas = solicitudes.filter(
      (s) => (s.estado === 'enviada' || s.estado === 'cotizada') && s.actualizadoEn < hace5dias,
    ).length;

    const items = await this.prisma.solicitudItem.findMany({
      select: { cotizacionItems: { select: { precioUnit: true, cantidad: true, seleccionado: true } } },
    });
    let ahorro = 0;
    for (const item of items) {
      const ganador = item.cotizacionItems.find((ci) => ci.seleccionado);
      if (!ganador || item.cotizacionItems.length < 2) continue;
      const promedio =
        item.cotizacionItems.reduce((s, ci) => s + Number(ci.precioUnit), 0) / item.cotizacionItems.length;
      const diff = (promedio - Number(ganador.precioUnit)) * Number(ganador.cantidad);
      if (diff > 0) ahorro += diff;
    }

    return {
      funnelPorEstado,
      solicitudesEnCurso,
      estancadasMas5Dias: estancadas,
      ahorroAdjudicacion: Math.round(ahorro * 100) / 100,
    };
  }

  private async ordenesCompra() {
    const meses = ultimosNMeses(6);
    const desde = new Date(meses[0].year, meses[0].month, 1);

    const [ordenes, emitidasNoRecibidas] = await Promise.all([
      this.prisma.ordenCompra.findMany({
        where: { estado: { not: 'cancelada' }, creadoEn: { gte: desde } },
        select: { creadoEn: true, montoTotal: true },
      }),
      this.prisma.ordenCompra.count({ where: { estado: 'emitida' } }),
    ]);

    const hoy = new Date();
    const entregaVencida = await this.prisma.ordenCompra.count({
      where: { estado: { notIn: ['recibida', 'cancelada'] }, fechaEntrega: { lt: hoy } },
    });

    const montoPorMes = meses.map(({ year, month, label }) => ({
      mes: label,
      monto: ordenes
        .filter((o) => o.creadoEn.getFullYear() === year && o.creadoEn.getMonth() === month)
        .reduce((s, o) => s + Number(o.montoTotal), 0),
    }));

    return { montoPorMes, emitidasNoRecibidas, entregaVencida };
  }

  private async inventario() {
    const [items, almacenes] = await Promise.all([
      this.prisma.itemInventario.findMany({ where: { activo: true }, select: { tipo: true } }),
      this.prisma.almacen.findMany({ where: { activo: true }, select: { tipo: true } }),
    ]);
    const itemsPorTipo = {
      consumible: items.filter((i) => i.tipo === 'consumible').length,
      activo: items.filter((i) => i.tipo === 'activo').length,
    };
    const almacenesPorTipo = {
      fijo: almacenes.filter((a) => a.tipo === 'fijo').length,
      temporal: almacenes.filter((a) => a.tipo === 'temporal').length,
    };
    return { itemsActivos: items.length, itemsPorTipo, almacenesActivos: almacenes.length, almacenesPorTipo };
  }
}
