import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hoyLima } from '../../shared/date/fecha.util.js';
import type {
  EstadoSolicitud,
  Role,
  TipoRequerimiento,
} from '../../prisma/types.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';

const MESES_LABEL = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function ultimosNMeses(
  n: number,
): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = [];
  const hoy = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    out.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: MESES_LABEL[d.getMonth()],
    });
  }
  return out;
}

function ultimasNSemanas(
  n: number,
): { start: Date; end: Date; label: string }[] {
  const out: { start: Date; end: Date; label: string }[] = [];
  const finSemanaActual = new Date();
  finSemanaActual.setDate(finSemanaActual.getDate() + 1);
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date(
      finSemanaActual.getTime() - i * 7 * 24 * 60 * 60 * 1000,
    );
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    out.push({ start, end, label: `S${n - i}` });
  }
  return out;
}

export type PrioridadDashboard = 'critica' | 'alta' | 'normal' | 'informativa';

export interface TareaDashboard {
  id: string;
  tipo: string;
  prioridad: PrioridadDashboard;
  titulo: string;
  contexto: string;
  href: string;
  fecha?: Date;
  requiereAccion: boolean;
  bloqueada: boolean;
  proxima: boolean;
}

export interface AccionRapidaDashboard {
  id: string;
  titulo: string;
  descripcion: string;
  href: string;
}

const PRIORIDAD_ORDEN: Record<PrioridadDashboard, number> = {
  critica: 0,
  alta: 1,
  normal: 2,
  informativa: 3,
};

const ROLES_FINANZAS: Role[] = ['administrador', 'gerencia'];
const ROLES_COTIZACIONES: Role[] = ['administrador', 'gerencia', 'logistica'];
const ROLES_ENTREGAS: Role[] = ['administrador', 'gerencia', 'logistica'];
const TIPOS_APROBABLES: Partial<Record<Role, TipoRequerimiento[]>> = {
  jefe_sig: ['civil', 'electrico', 'seguridad', 'administrativo'],
  logistica: ['administrativo'],
  ing_civil: ['civil', 'electrico', 'seguridad', 'administrativo'],
  ing_electrico: ['civil', 'electrico', 'seguridad', 'administrativo'],
  gerencia: ['civil', 'electrico', 'seguridad', 'administrativo'],
  administrador: ['civil', 'electrico', 'seguridad', 'administrativo'],
};

const TIPOS_COMPRA_TECNICA: Partial<Record<Role, TipoRequerimiento[]>> = {
  ing_civil: ['civil', 'electrico', 'seguridad', 'administrativo'],
  ing_electrico: ['civil', 'electrico', 'seguridad', 'administrativo'],
  jefe_sig: ['civil', 'electrico', 'seguridad', 'administrativo'],
  logistica: ['administrativo'],
  administrador: ['civil', 'electrico', 'seguridad', 'administrativo'],
};

export function ordenarTareas(tareas: TareaDashboard[]) {
  return [...tareas].sort((a, b) => {
    const prioridad =
      PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad];
    if (prioridad !== 0) return prioridad;
    if (a.requiereAccion !== b.requiereAccion) return a.requiereAccion ? -1 : 1;
    return (
      (a.fecha?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.fecha?.getTime() ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

function etiquetaRol(role: Role) {
  return {
    supervisor: 'Supervisor',
    supervisor_civil: 'Supervisor civil',
    supervisor_electrico: 'Supervisor eléctrico',
    pdr: 'Prevención de riesgos',
    ing_civil: 'Ingeniería civil',
    ing_electrico: 'Ingeniería eléctrica',
    jefe_sig: 'Jefatura SIG',
    logistica: 'Logística',
    gerencia: 'Gerencia',
    administrador: 'Administración',
    admin_ti: 'Administración TI',
  }[role];
}

function dinero(monto: unknown) {
  return Number(monto).toLocaleString('es-PE', {
    style: 'currency',
    currency: 'PEN',
  });
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async inicio(user: AuthenticatedUser) {
    const hoy = hoyLima();
    const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
    const tareas: TareaDashboard[] = [];
    const seguimiento: TareaDashboard[] = [];

    // Lo que el solicitante puede retomar o confirmar siempre se limita a sus propios registros.
    if (user.role !== 'admin_ti') {
      const propios = await this.prisma.requerimiento.findMany({
        where: {
          creadoPorId: user.id,
          estado: { in: ['borrador', 'observado', 'pendiente_conformidad'] },
        },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          estado: true,
          urgente: true,
          fechaEntregaRequerida: true,
          notaRevision: true,
        },
        orderBy: [{ urgente: 'desc' }, { actualizadoEn: 'asc' }],
        take: 8,
      });
      for (const req of propios) {
        const observado = req.estado === 'observado';
        const conformidad = req.estado === 'pendiente_conformidad';
        tareas.push({
          id: `requerimiento-propio-${req.id}`,
          tipo: 'requerimiento',
          prioridad: req.urgente || observado ? 'alta' : 'normal',
          titulo: conformidad
            ? `Confirma la recepción de ${req.codigo}`
            : observado
              ? `Corrige ${req.codigo}`
              : `Completa ${req.codigo}`,
          contexto: conformidad
            ? `${req.nombre} ya fue recibido y espera tu conformidad.`
            : (req.notaRevision ?? req.nombre),
          href: `/requerimientos/${req.id}`,
          fecha: req.fechaEntregaRequerida ?? undefined,
          requiereAccion: true,
          bloqueada: observado,
          proxima: Boolean(
            req.fechaEntregaRequerida &&
            req.fechaEntregaRequerida >= hoy &&
            req.fechaEntregaRequerida <= en7dias,
          ),
        });
      }

      const solicitudesPropias = await this.prisma.solicitudCotizacion.findMany(
        {
          where: {
            requerimiento: { creadoPorId: user.id },
            estado: { notIn: ['orden_generada', 'cancelada'] },
          },
          select: {
            id: true,
            codigo: true,
            estado: true,
            actualizadoEn: true,
            requerimiento: { select: { id: true, codigo: true, nombre: true } },
          },
          orderBy: { actualizadoEn: 'desc' },
          take: 4,
        },
      );
      for (const solicitud of solicitudesPropias) {
        seguimiento.push({
          id: `solicitud-propia-${solicitud.id}`,
          tipo: 'solicitud',
          prioridad: 'informativa',
          titulo: `${solicitud.codigo} está ${solicitud.estado.replaceAll('_', ' ')}`,
          contexto: solicitud.requerimiento
            ? `${solicitud.requerimiento.codigo} · ${solicitud.requerimiento.nombre}`
            : 'Solicitud sin requerimiento vinculado.',
          href: `/cotizaciones/${solicitud.id}`,
          fecha: solicitud.actualizadoEn,
          requiereAccion: false,
          bloqueada: false,
          proxima: false,
        });
      }
    }

    const tiposAprobables = TIPOS_APROBABLES[user.role];
    if (tiposAprobables?.length) {
      const porAprobar = await this.prisma.requerimiento.findMany({
        where: { estado: 'enviado', tipo: { in: tiposAprobables } },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          urgente: true,
          fechaEntregaRequerida: true,
          proyecto: { select: { codigo: true, nombre: true } },
        },
        orderBy: [{ urgente: 'desc' }, { creadoEn: 'asc' }],
        take: 8,
      });
      for (const req of porAprobar) {
        tareas.push({
          id: `requerimiento-aprobar-${req.id}`,
          tipo: 'aprobacion_requerimiento',
          prioridad: req.urgente ? 'critica' : 'alta',
          titulo: `Revisa ${req.codigo}`,
          contexto: `${req.nombre} · ${req.proyecto.codigo ?? req.proyecto.nombre}`,
          href: `/requerimientos/${req.id}`,
          fecha: req.fechaEntregaRequerida ?? undefined,
          requiereAccion: true,
          bloqueada: false,
          proxima: Boolean(
            req.fechaEntregaRequerida &&
            req.fechaEntregaRequerida >= hoy &&
            req.fechaEntregaRequerida <= en7dias,
          ),
        });
      }
    }

    if (ROLES_COTIZACIONES.includes(user.role)) {
      const estados: EstadoSolicitud[] =
        user.role === 'logistica'
          ? ['enviada', 'cotizada', 'seleccionada']
          : ['seleccionada', 'aprobada_solicitante'];
      const solicitudes = await this.prisma.solicitudCotizacion.findMany({
        where: { estado: { in: estados } },
        select: {
          id: true,
          codigo: true,
          estado: true,
          actualizadoEn: true,
          proyecto: { select: { codigo: true, nombre: true } },
        },
        orderBy: { actualizadoEn: 'asc' },
        take: 7,
      });
      for (const solicitud of solicitudes) {
        tareas.push({
          id: `cotizacion-${solicitud.id}`,
          tipo: 'cotizacion',
          prioridad:
            solicitud.estado === 'aprobada_solicitante' ? 'alta' : 'normal',
          titulo:
            solicitud.estado === 'aprobada_solicitante'
              ? `Aprueba ${solicitud.codigo}`
              : `Da seguimiento a ${solicitud.codigo}`,
          contexto: solicitud.proyecto
            ? `${solicitud.proyecto.codigo ?? solicitud.proyecto.nombre} · Estado: ${solicitud.estado.replaceAll('_', ' ')}`
            : `Estado: ${solicitud.estado.replaceAll('_', ' ')}`,
          href: `/cotizaciones/${solicitud.id}`,
          fecha: solicitud.actualizadoEn,
          requiereAccion:
            solicitud.estado === 'seleccionada' ||
            solicitud.estado === 'aprobada_solicitante',
          bloqueada: false,
          proxima: false,
        });
      }
    }

    const tiposCompra = TIPOS_COMPRA_TECNICA[user.role];
    if (
      tiposCompra?.length ||
      ['gerencia', 'administrador', 'admin_ti'].includes(user.role)
    ) {
      const grupos = await this.prisma.ordenCompra.findMany({
        where: {
          origen: 'simple',
          estadoAprobacion:
            user.role === 'gerencia'
              ? 'aprobada_tecnico'
              : { in: ['pendiente', 'aprobada_tecnico', 'observada'] },
          compraSimple: tiposCompra ? { tipo: { in: tiposCompra } } : undefined,
        },
        select: {
          id: true,
          numero: true,
          estadoAprobacion: true,
          actualizadoEn: true,
          compraSimple: { select: { id: true, codigo: true, nombre: true } },
        },
        orderBy: { actualizadoEn: 'asc' },
        take: 6,
      });
      for (const grupo of grupos) {
        if (!grupo.compraSimple) continue;
        const observada = grupo.estadoAprobacion === 'observada';
        tareas.push({
          id: `compra-simple-${grupo.id}`,
          tipo: 'compra_simple',
          prioridad: observada ? 'alta' : 'normal',
          titulo: observada
            ? `Destraba ${grupo.numero}`
            : `Revisa ${grupo.numero}`,
          contexto: `${grupo.compraSimple.codigo} · ${grupo.compraSimple.nombre}`,
          href: `/compras-simples/${grupo.compraSimple.id}`,
          fecha: grupo.actualizadoEn,
          requiereAccion: true,
          bloqueada: observada,
          proxima: false,
        });
      }
    }

    if (ROLES_ENTREGAS.includes(user.role)) {
      const entregas = await this.prisma.ordenCompra.findMany({
        where: {
          estado: { notIn: ['recibida', 'cancelada'] },
          fechaEntrega: { lt: hoy },
        },
        select: {
          id: true,
          numero: true,
          fechaEntrega: true,
          proyecto: { select: { codigo: true, nombre: true } },
        },
        orderBy: { fechaEntrega: 'asc' },
        take: 5,
      });
      for (const oc of entregas) {
        tareas.push({
          id: `entrega-${oc.id}`,
          tipo: 'entrega_vencida',
          prioridad: 'critica',
          titulo: `Entrega vencida: ${oc.numero}`,
          contexto: oc.proyecto.codigo ?? oc.proyecto.nombre,
          href: `/ordenes-compra/${oc.id}`,
          fecha: oc.fechaEntrega ?? undefined,
          requiereAccion: true,
          bloqueada: true,
          proxima: false,
        });
      }
    }

    if (ROLES_FINANZAS.includes(user.role)) {
      const [pagos, cobros, planillas] = await Promise.all([
        this.prisma.pago.findMany({
          where: { estado: 'pendiente', fechaProgramada: { lte: en7dias } },
          select: {
            id: true,
            concepto: true,
            beneficiarioNombre: true,
            monto: true,
            fechaProgramada: true,
            proyecto: { select: { codigo: true, nombre: true } },
          },
          orderBy: { fechaProgramada: 'asc' },
          take: 6,
        }),
        this.prisma.cobro.findMany({
          where: { estado: 'pendiente', fechaProgramada: { lte: en7dias } },
          select: {
            id: true,
            monto: true,
            fechaProgramada: true,
            proyecto: { select: { codigo: true, nombre: true } },
          },
          orderBy: { fechaProgramada: 'asc' },
          take: 4,
        }),
        this.prisma.planillaStaff.findMany({
          where: { estado: 'borrador' },
          select: { id: true, periodo: true, totalGeneral: true },
          orderBy: { actualizadoEn: 'asc' },
          take: 2,
        }),
      ]);
      for (const pago of pagos) {
        const vencido = pago.fechaProgramada < hoy;
        tareas.push({
          id: `pago-${pago.id}`,
          tipo: 'pago',
          prioridad: vencido ? 'critica' : 'alta',
          titulo: vencido
            ? `Pago vencido: ${pago.concepto ?? pago.beneficiarioNombre ?? 'sin concepto'}`
            : `Programa pago: ${pago.concepto ?? pago.beneficiarioNombre ?? 'sin concepto'}`,
          contexto: `${dinero(pago.monto)}${pago.proyecto ? ` · ${pago.proyecto.codigo ?? pago.proyecto.nombre}` : ''}`,
          href: `/pagos/${pago.id}`,
          fecha: pago.fechaProgramada,
          requiereAccion: true,
          bloqueada: vencido,
          proxima: !vencido,
        });
      }
      for (const cobro of cobros) {
        const vencido = cobro.fechaProgramada < hoy;
        tareas.push({
          id: `cobro-${cobro.id}`,
          tipo: 'cobro',
          prioridad: vencido ? 'critica' : 'alta',
          titulo: vencido ? 'Cobro vencido' : 'Cobro próximo',
          contexto: `${dinero(cobro.monto)} · ${cobro.proyecto.codigo ?? cobro.proyecto.nombre}`,
          href: `/cobros/${cobro.id}`,
          fecha: cobro.fechaProgramada,
          requiereAccion: true,
          bloqueada: vencido,
          proxima: !vencido,
        });
      }
      for (const planilla of planillas) {
        tareas.push({
          id: `planilla-${planilla.id}`,
          tipo: 'planilla_staff',
          prioridad: 'normal',
          titulo: `Revisa planilla staff ${planilla.periodo}`,
          contexto: `Borrador por ${dinero(planilla.totalGeneral)}.`,
          href: '/pagos',
          requiereAccion: true,
          bloqueada: false,
          proxima: false,
        });
      }
    }

    if (user.role === 'pdr') {
      const turnos = await this.prisma.turno.findMany({
        where: { estado: 'abierto', abiertoPorId: user.id },
        select: {
          id: true,
          proyectoId: true,
          fecha: true,
          proyecto: { select: { codigo: true, nombre: true } },
        },
        orderBy: { horaAperturaReal: 'asc' },
        take: 4,
      });
      for (const turno of turnos) {
        tareas.push({
          id: `turno-${turno.id}`,
          tipo: 'asistencia',
          prioridad: 'alta',
          titulo: 'Cierra la jornada de asistencia',
          contexto: turno.proyecto.codigo ?? turno.proyecto.nombre,
          href: `/asistencia/turno/${turno.proyectoId}`,
          fecha: turno.fecha,
          requiereAccion: true,
          bloqueada: false,
          proxima: false,
        });
      }
    }

    const ordenadas = ordenarTareas(tareas);
    return {
      usuario: {
        name: user.name,
        role: user.role,
        etiquetaRol: etiquetaRol(user.role),
      },
      resumen: {
        pendientes: tareas.filter((t) => t.requiereAccion).length,
        bloqueos: tareas.filter((t) => t.bloqueada).length,
        proximos: tareas.filter((t) => t.proxima).length,
      },
      tareas: ordenadas.slice(0, 7),
      seguimiento: ordenarTareas(seguimiento).slice(0, 4),
      accionesRapidas: this.accionesRapidas(user.role),
    };
  }

  private accionesRapidas(role: Role): AccionRapidaDashboard[] {
    const comunes: AccionRapidaDashboard[] = [
      {
        id: 'requerimiento',
        titulo: 'Nuevo requerimiento',
        descripcion: 'Solicita materiales o servicios para una obra.',
        href: '/requerimientos/nuevo',
      },
      {
        id: 'pagos',
        titulo: 'Ver pagos',
        descripcion: 'Consulta tus pagos y recordatorios.',
        href: '/pagos',
      },
    ];
    if (role === 'admin_ti')
      return [
        {
          id: 'usuarios',
          titulo: 'Usuarios',
          descripcion: 'Administra los accesos del equipo.',
          href: '/usuarios',
        },
        {
          id: 'ordenes',
          titulo: 'Órdenes de compra',
          descripcion: 'Consulta órdenes y sus estados.',
          href: '/ordenes-compra',
        },
        {
          id: 'reportes',
          titulo: 'Reportes',
          descripcion: 'Consulta reportes disponibles.',
          href: '/reportes',
        },
      ];
    if (role === 'pdr')
      return [
        {
          id: 'asistencia',
          titulo: 'Asistencia',
          descripcion: 'Abre o continúa una jornada de obra.',
          href: '/asistencia',
        },
        ...comunes,
        {
          id: 'compra',
          titulo: 'Nueva compra',
          descripcion: 'Registra una compra simple.',
          href: '/compras-simples/nueva',
        },
      ];
    if (ROLES_FINANZAS.includes(role))
      return [
        {
          id: 'pago',
          titulo: 'Nuevo recordatorio',
          descripcion: 'Registra una obligación de pago.',
          href: '/pagos',
        },
        {
          id: 'cobros',
          titulo: 'Ver cobros',
          descripcion: 'Revisa el calendario de cobros.',
          href: '/cobros',
        },
        {
          id: 'planilla',
          titulo: 'Planilla staff',
          descripcion: 'Consulta y genera planillas mensuales.',
          href: '/pagos',
        },
        ...comunes.slice(0, 1),
      ];
    if (role === 'logistica')
      return [
        {
          id: 'cotizaciones',
          titulo: 'Cotizaciones',
          descripcion: 'Continúa solicitudes y respuestas de proveedores.',
          href: '/cotizaciones',
        },
        {
          id: 'ordenes',
          titulo: 'Órdenes de compra',
          descripcion: 'Revisa entregas y órdenes emitidas.',
          href: '/ordenes-compra',
        },
        ...comunes,
      ];
    return comunes;
  }

  async resumen() {
    const [proyectos, requerimientos, cotizaciones, ordenesCompra, inventario] =
      await Promise.all([
        this.proyectos(),
        this.requerimientos(),
        this.cotizaciones(),
        this.ordenesCompra(),
        this.inventario(),
      ]);

    return {
      proyectos,
      requerimientos,
      cotizaciones,
      ordenesCompra,
      inventario,
    };
  }

  async finanzas() {
    const meses = ultimosNMeses(6);
    const desde = new Date(meses[0].year, meses[0].month, 1);

    const pagos = await this.prisma.pago.findMany({
      where: {
        estado: { in: ['pendiente', 'pagado'] },
        OR: [
          { fechaProgramada: { gte: desde } },
          { fechaPagoReal: { gte: desde } },
        ],
      },
      select: {
        estado: true,
        monto: true,
        fechaProgramada: true,
        fechaPagoReal: true,
      },
    });

    const hoy = new Date();
    const hoyCalendario = hoyLima();
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
        if (p.fechaProgramada < hoyCalendario) totalVencido += monto;
        else if (p.fechaProgramada <= en7dias) proximos7dias += monto;
      } else if (
        p.estado === 'pagado' &&
        p.fechaPagoReal &&
        p.fechaPagoReal >= inicioMesActual
      ) {
        pagadoMes += monto;
      }
    }

    const montoPorMes = meses.map(({ year, month, label }) => {
      let pagado = 0;
      let pendiente = 0;
      let vencido = 0;
      for (const p of pagos) {
        if (p.estado === 'pagado' && p.fechaPagoReal) {
          if (
            p.fechaPagoReal.getFullYear() === year &&
            p.fechaPagoReal.getMonth() === month
          )
            pagado += Number(p.monto);
        } else if (p.estado === 'pendiente') {
          if (
            p.fechaProgramada.getFullYear() === year &&
            p.fechaProgramada.getMonth() === month
          ) {
            if (p.fechaProgramada < hoyCalendario) vencido += Number(p.monto);
            else pendiente += Number(p.monto);
          }
        }
      }
      return { mes: label, pagado, pendiente, vencido };
    });

    return {
      totalPendiente,
      totalVencido,
      proximos7dias,
      pagadoMes,
      montoPorMes,
    };
  }

  private async proyectos() {
    const proyectos = await this.prisma.proyecto.findMany({
      select: { estado: true },
    });
    const porEstado = {
      planificacion: 0,
      ejecucion: 0,
      cierre: 0,
      liquidada: 0,
    };
    for (const p of proyectos) porEstado[p.estado]++;

    const hoy = new Date();
    const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [hitosProximos, hitosIncumplidos] = await Promise.all([
      this.prisma.hito.count({
        where: {
          cumplimiento: { in: ['no', 'programado'] },
          fechaProgramada: { gte: hoy, lte: en7dias },
        },
      }),
      this.prisma.hito.count({ where: { cumplimiento: 'no' } }),
    ]);

    return {
      total: proyectos.length,
      porEstado,
      hitosProximos7dias: hitosProximos,
      hitosIncumplidos,
    };
  }

  private async requerimientos() {
    const semanas = ultimasNSemanas(8);
    const desde = semanas[0].start;

    const [creados, aprobados, pendientes, urgentesPendientes] =
      await Promise.all([
        this.prisma.requerimiento.findMany({
          where: { creadoEn: { gte: desde } },
          select: { creadoEn: true },
        }),
        this.prisma.requerimientoHistorial.findMany({
          where: { estado: 'aprobado', creadoEn: { gte: desde } },
          select: { creadoEn: true, requerimientoId: true },
          distinct: ['requerimientoId'],
          orderBy: { creadoEn: 'asc' },
        }),
        this.prisma.requerimiento.count({ where: { estado: 'enviado' } }),
        this.prisma.requerimiento.count({
          where: { estado: 'enviado', urgente: true },
        }),
      ]);

    const tendenciaSemanal = semanas.map(({ start, end, label }) => ({
      semana: label,
      creados: creados.filter((r) => r.creadoEn >= start && r.creadoEn < end)
        .length,
      aprobados: aprobados.filter(
        (a) => a.creadoEn >= start && a.creadoEn < end,
      ).length,
    }));

    const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const aprobadosRecientes =
      await this.prisma.requerimientoHistorial.findMany({
        where: { estado: 'aprobado', creadoEn: { gte: hace30dias } },
        select: {
          creadoEn: true,
          requerimiento: { select: { creadoEn: true } },
        },
        distinct: ['requerimientoId'],
      });
    const tiempoPromedioDias = aprobadosRecientes.length
      ? aprobadosRecientes.reduce(
          (s, a) =>
            s +
            (a.creadoEn.getTime() - a.requerimiento.creadoEn.getTime()) /
              (24 * 60 * 60 * 1000),
          0,
        ) / aprobadosRecientes.length
      : null;

    return {
      tendenciaSemanal,
      pendientesAprobacion: pendientes,
      urgentesPendientes,
      tiempoPromedioAprobacionDias:
        tiempoPromedioDias !== null
          ? Number(tiempoPromedioDias.toFixed(1))
          : null,
    };
  }

  private async cotizaciones() {
    const solicitudes = await this.prisma.solicitudCotizacion.findMany({
      select: { estado: true, actualizadoEn: true },
    });
    const funnelMap = {
      borrador: 0,
      enviada: 0,
      cotizada: 0,
      seleccionada: 0,
      aprobada: 0,
    };
    for (const s of solicitudes) {
      if (
        s.estado === 'aprobada_solicitante' ||
        s.estado === 'aprobada_gerencia'
      )
        funnelMap.aprobada++;
      else if (s.estado in funnelMap)
        funnelMap[s.estado as keyof typeof funnelMap]++;
    }
    const funnelPorEstado = Object.entries(funnelMap).map(([etapa, value]) => ({
      etapa,
      value,
    }));
    const solicitudesEnCurso = solicitudes.filter(
      (s) => s.estado !== 'aprobada_gerencia' && s.estado !== 'cancelada',
    ).length;

    const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const estancadas = solicitudes.filter(
      (s) =>
        (s.estado === 'enviada' || s.estado === 'cotizada') &&
        s.actualizadoEn < hace5dias,
    ).length;

    const items = await this.prisma.solicitudItem.findMany({
      select: {
        cotizacionItems: {
          select: { precioUnit: true, cantidad: true, seleccionado: true },
        },
      },
    });
    let ahorro = 0;
    for (const item of items) {
      const ganador = item.cotizacionItems.find((ci) => ci.seleccionado);
      if (!ganador || item.cotizacionItems.length < 2) continue;
      const promedio =
        item.cotizacionItems.reduce((s, ci) => s + Number(ci.precioUnit), 0) /
        item.cotizacionItems.length;
      const diff =
        (promedio - Number(ganador.precioUnit)) * Number(ganador.cantidad);
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
      where: {
        estado: { notIn: ['recibida', 'cancelada'] },
        fechaEntrega: { lt: hoy },
      },
    });

    const montoPorMes = meses.map(({ year, month, label }) => ({
      mes: label,
      monto: ordenes
        .filter(
          (o) =>
            o.creadoEn.getFullYear() === year &&
            o.creadoEn.getMonth() === month,
        )
        .reduce((s, o) => s + Number(o.montoTotal), 0),
    }));

    return { montoPorMes, emitidasNoRecibidas, entregaVencida };
  }

  private async inventario() {
    const [items, almacenes] = await Promise.all([
      this.prisma.itemInventario.findMany({
        where: { activo: true },
        select: { tipo: true },
      }),
      this.prisma.almacen.findMany({
        where: { activo: true },
        select: { tipo: true },
      }),
    ]);
    const itemsPorTipo = {
      consumible: items.filter((i) => i.tipo === 'consumible').length,
      activo: items.filter((i) => i.tipo === 'activo').length,
    };
    const almacenesPorTipo = {
      fijo: almacenes.filter((a) => a.tipo === 'fijo').length,
      temporal: almacenes.filter((a) => a.tipo === 'temporal').length,
    };
    return {
      itemsActivos: items.length,
      itemsPorTipo,
      almacenesActivos: almacenes.length,
      almacenesPorTipo,
    };
  }
}
