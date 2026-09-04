import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  EstadoAprobacionCompra,
  EstadoCotizacion,
  EstadoOrdenCompra,
  EstadoRequerimiento,
  EstadoSolicitud,
  Role,
} from '../../prisma/types.js';
import { QuerySolicitudesDto } from './dto/query-solicitudes.dto.js';
import type {
  ColumnaKanbanSolicitud,
  ConteoEstados,
  EtapaSolicitud,
  GrupoPrecotizadoResumen,
  SolicitudResumen,
} from './solicitudes.types.js';

const RESTRICTED_ROLES: Role[] = [
  'supervisor',
  'supervisor_civil',
  'supervisor_electrico',
  'pdr',
];

const ETAPA_MACRO: Record<EstadoRequerimiento, EtapaSolicitud> = {
  borrador: 'borrador',
  enviado: 'validacion_tecnica',
  aprobado: 'aprobada_requerimiento',
  observado: 'observada',
  en_cotizacion: 'en_cotizacion',
  pendiente_conformidad: 'pendiente_conformidad',
  recibido: 'recibida',
  cancelado: 'cancelada',
};

type GrupoSimple = {
  estado: EstadoOrdenCompra;
  estadoAprobacion: EstadoAprobacionCompra | null;
};

type SolicitudMacroSimple = {
  estado: EstadoSolicitud;
  ordenes: Array<{ estado: EstadoOrdenCompra }>;
};

function conteoEstados<T extends string>(estados: T[]): ConteoEstados<T> {
  const porEstado: Partial<Record<T, number>> = {};
  for (const estado of estados) {
    porEstado[estado] = (porEstado[estado] ?? 0) + 1;
  }
  return { total: estados.length, porEstado };
}

function etapaGrupoPrecotizado(grupo: GrupoSimple): EtapaSolicitud {
  if (grupo.estado === 'cancelada') return 'cancelada';
  if (grupo.estadoAprobacion === 'observada') return 'observada';
  if (grupo.estadoAprobacion === 'pendiente') return 'validacion_tecnica';
  if (grupo.estadoAprobacion === 'aprobada_tecnico') {
    return 'aprobada_tecnico';
  }

  if (grupo.estado === 'recibida') return 'recibida';
  if (grupo.estado === 'recibida_parcial') return 'recibida_parcial';
  if (grupo.estado === 'emitida') return 'emitida';
  if (grupo.estadoAprobacion === 'aprobada') return 'aprobada_gerencia';

  return 'borrador';
}

function etapaPrecotizado(grupos: GrupoSimple[]): EtapaSolicitud {
  if (grupos.length === 0) return 'borrador';

  const etapas = new Set(grupos.map(etapaGrupoPrecotizado));
  return etapas.size === 1 ? [...etapas][0] : 'mixta';
}

function columnaMacro(
  estado: EstadoRequerimiento,
  solicitudes: SolicitudMacroSimple[],
): ColumnaKanbanSolicitud | null {
  if (estado === 'observado') return 'requiere_correccion';
  if (
    estado === 'borrador' ||
    estado === 'recibido' ||
    estado === 'cancelado'
  ) {
    return null;
  }
  if (estado === 'enviado') return 'validacion_tecnica';
  if (estado === 'pendiente_conformidad') return 'recepcion_conformidad';

  const activas = solicitudes.filter(
    (solicitud) => solicitud.estado !== 'cancelada',
  );
  const estadosOrden = activas.flatMap((solicitud) =>
    solicitud.ordenes.map((orden) => orden.estado),
  );
  const tieneCotizacionActiva = activas.some((solicitud) =>
    ['borrador', 'enviada', 'cotizada', 'seleccionada'].includes(
      solicitud.estado,
    ),
  );
  const esperaGerencia = activas.some(
    (solicitud) => solicitud.estado === 'aprobada_solicitante',
  );
  const listaParaEmitir = activas.some(
    (solicitud) => solicitud.estado === 'aprobada_gerencia',
  );

  if (tieneCotizacionActiva) return 'cotizacion_seleccion';
  if (esperaGerencia) return 'aprobacion_gerencia';
  if (listaParaEmitir || estadosOrden.includes('borrador')) return 'por_emitir';
  if (estadosOrden.includes('emitida')) return 'compra_curso';
  if (
    estadosOrden.includes('recibida_parcial') ||
    estadosOrden.includes('recibida')
  ) {
    return 'recepcion_conformidad';
  }

  return 'cotizacion_seleccion';
}

function columnaPrecotizado(
  grupos: GrupoSimple[],
): ColumnaKanbanSolicitud | null {
  if (grupos.length === 0) return null;

  const activos = grupos.filter(
    (grupo) => grupo.estado !== 'cancelada' && grupo.estado !== 'recibida',
  );
  if (activos.length === 0) return null;
  if (activos.some((grupo) => grupo.estadoAprobacion === 'observada')) {
    return 'requiere_correccion';
  }
  if (activos.some((grupo) => grupo.estadoAprobacion === 'pendiente')) {
    return 'validacion_tecnica';
  }
  if (activos.some((grupo) => grupo.estadoAprobacion === 'aprobada_tecnico')) {
    return 'aprobacion_gerencia';
  }
  if (
    activos.some(
      (grupo) =>
        grupo.estado === 'borrador' && grupo.estadoAprobacion === 'aprobada',
    )
  ) {
    return 'por_emitir';
  }
  if (activos.some((grupo) => grupo.estado === 'emitida')) {
    return 'compra_curso';
  }
  if (activos.some((grupo) => grupo.estado === 'recibida_parcial')) {
    return 'recepcion_conformidad';
  }

  // Grupos todavía no enviados a aprobación se consideran borradores.
  return null;
}

function estadoPrecotizado(grupos: GrupoSimple[]): string {
  if (grupos.length === 0) return 'sin_grupos';

  const estados = new Set(
    grupos.map((grupo) => grupo.estadoAprobacion ?? grupo.estado),
  );
  return estados.size === 1 ? [...estados][0] : 'grupos_mixtos';
}

function resumenGrupos(grupos: GrupoSimple[]) {
  return {
    total: grupos.length,
    pendientes: grupos.filter(
      (grupo) =>
        grupo.estadoAprobacion === 'pendiente' ||
        grupo.estadoAprobacion === 'aprobada_tecnico',
    ).length,
    observados: grupos.filter(
      (grupo) =>
        grupo.estadoAprobacion === 'observada' || grupo.estado === 'cancelada',
    ).length,
  };
}

@Injectable()
export class SolicitudesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QuerySolicitudesDto, userId: string, userRole: Role) {
    const requierePropias = RESTRICTED_ROLES.includes(userRole);
    const termino = query.q?.trim();

    const whereRequerimientos: Record<string, unknown> = {};
    const whereCompras: Record<string, unknown> = {};

    if (query.proyectoId) {
      whereRequerimientos.proyectoId = query.proyectoId;
      whereCompras.proyectoId = query.proyectoId;
    }
    if (requierePropias) {
      whereRequerimientos.creadoPorId = userId;
      whereCompras.creadoPorId = userId;
    }
    if (termino) {
      const or = [
        { codigo: { contains: termino, mode: 'insensitive' } },
        { nombre: { contains: termino, mode: 'insensitive' } },
        { proyecto: { nombre: { contains: termino, mode: 'insensitive' } } },
        { proyecto: { codigo: { contains: termino, mode: 'insensitive' } } },
        { creadoPor: { name: { contains: termino, mode: 'insensitive' } } },
      ];
      whereRequerimientos.OR = or;
      whereCompras.OR = or;
    }

    const [requerimientos, compras] = await Promise.all([
      query.origen === 'precotizado'
        ? []
        : this.prisma.requerimiento.findMany({
            where: whereRequerimientos,
            select: {
              id: true,
              codigo: true,
              nombre: true,
              tipo: true,
              estado: true,
              urgente: true,
              notaRevision: true,
              fechaEntregaRequerida: true,
              creadoEn: true,
              proyecto: { select: { id: true, codigo: true, nombre: true } },
              creadoPor: { select: { id: true, name: true } },
              _count: { select: { items: true } },
              solicitudes: {
                select: {
                  id: true,
                  codigo: true,
                  estado: true,
                  cotizaciones: { select: { estado: true } },
                  ordenes: { select: { estado: true } },
                },
                orderBy: { creadoEn: 'asc' },
              },
            },
          }),
      query.origen === 'macro'
        ? []
        : this.prisma.compraSimple.findMany({
            where: whereCompras,
            select: {
              id: true,
              codigo: true,
              nombre: true,
              tipo: true,
              esRendicion: true,
              creadoEn: true,
              proyecto: { select: { id: true, codigo: true, nombre: true } },
              creadoPor: { select: { id: true, name: true } },
              grupos: {
                select: {
                  id: true,
                  numero: true,
                  nombre: true,
                  tipo: true,
                  estado: true,
                  estadoAprobacion: true,
                  montoTotal: true,
                  proveedorId: true,
                  proveedorNombreLibre: true,
                  proveedor: { select: { id: true, razonSocial: true } },
                  _count: {
                    select: { items: true, pagos: true, archivos: true },
                  },
                },
                orderBy: { creadoEn: 'asc' },
              },
            },
          }),
    ]);

    const macro: SolicitudResumen[] = requerimientos.map((requerimiento) => {
      const etapa = ETAPA_MACRO[requerimiento.estado];
      const columnaKanban = columnaMacro(
        requerimiento.estado,
        requerimiento.solicitudes,
      );
      return {
        id: requerimiento.id,
        origen: 'macro' as const,
        tipo: requerimiento.tipo,
        codigo: requerimiento.codigo,
        nombre: requerimiento.nombre,
        proyecto: requerimiento.proyecto,
        creadoPor: requerimiento.creadoPor,
        creadoEn: requerimiento.creadoEn.toISOString(),
        etapa,
        columnaKanban,
        estadoNativo: requerimiento.estado,
        requiereAtencion: columnaKanban === 'requiere_correccion',
        esTerminal:
          requerimiento.estado === 'recibido' ||
          requerimiento.estado === 'cancelado',
        hrefDetalle: `/requerimientos/${requerimiento.id}`,
        flujo: {
          origen: 'macro' as const,
          requerimiento: {
            estado: requerimiento.estado,
            urgente: requerimiento.urgente,
            notaRevision: requerimiento.notaRevision,
            fechaEntregaRequerida:
              requerimiento.fechaEntregaRequerida?.toISOString() ?? null,
            items: requerimiento._count.items,
          },
          solicitudesCotizacion: requerimiento.solicitudes.map((solicitud) => ({
            id: solicitud.id,
            codigo: solicitud.codigo,
            estado: solicitud.estado as EstadoSolicitud,
            cotizaciones: conteoEstados<EstadoCotizacion>(
              solicitud.cotizaciones.map((cotizacion) => cotizacion.estado),
            ),
            ordenes: conteoEstados<EstadoOrdenCompra>(
              solicitud.ordenes.map((orden) => orden.estado),
            ),
          })),
        },
      };
    });

    const precotizadas: SolicitudResumen[] = compras.map((compra) => {
      const etapa = etapaPrecotizado(compra.grupos);
      const columnaKanban = columnaPrecotizado(compra.grupos);
      const grupos: GrupoPrecotizadoResumen[] = compra.grupos.map((grupo) => ({
        id: grupo.id,
        numero: grupo.numero,
        nombre: grupo.nombre,
        tipoOrden: grupo.tipo,
        estado: grupo.estado,
        estadoAprobacion: grupo.estadoAprobacion,
        proveedor: grupo.proveedor
          ? { id: grupo.proveedor.id, nombre: grupo.proveedor.razonSocial }
          : grupo.proveedorNombreLibre
            ? { id: null, nombre: grupo.proveedorNombreLibre }
            : null,
        montoTotal: Number(grupo.montoTotal),
        items: grupo._count.items,
        pagos: grupo._count.pagos,
        archivos: grupo._count.archivos,
      }));
      return {
        id: compra.id,
        origen: 'precotizado' as const,
        tipo: compra.tipo,
        codigo: compra.codigo,
        nombre: compra.nombre,
        proyecto: compra.proyecto,
        creadoPor: compra.creadoPor,
        creadoEn: compra.creadoEn.toISOString(),
        etapa,
        columnaKanban,
        estadoNativo: estadoPrecotizado(compra.grupos),
        requiereAtencion: columnaKanban === 'requiere_correccion',
        esTerminal:
          grupos.length > 0 &&
          grupos.every(
            (grupo) =>
              grupo.estado === 'recibida' || grupo.estado === 'cancelada',
          ),
        hrefDetalle: `/compras-simples/${compra.id}`,
        resumenGrupos: resumenGrupos(compra.grupos),
        flujo: {
          origen: 'precotizado' as const,
          esRendicion: compra.esRendicion,
          grupos,
          aprobaciones: conteoEstados<EstadoAprobacionCompra>(
            grupos.flatMap((grupo) =>
              grupo.estadoAprobacion ? [grupo.estadoAprobacion] : [],
            ),
          ),
          ordenes: conteoEstados<EstadoOrdenCompra>(
            grupos.map((grupo) => grupo.estado),
          ),
          montoTotal: grupos.reduce(
            (total, grupo) => total + grupo.montoTotal,
            0,
          ),
        },
      };
    });

    const ordenadas = [...macro, ...precotizadas]
      .filter((solicitud) => {
        if (query.vista === 'activas') return solicitud.columnaKanban !== null;
        if (query.vista === 'historial') return solicitud.esTerminal;
        return true;
      })
      .filter((solicitud) => !query.etapa || solicitud.etapa === query.etapa)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return {
      data: ordenadas.slice(offset, offset + limit),
      total: ordenadas.length,
    };
  }
}
