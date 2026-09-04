import type {
  EstadoAprobacionCompra,
  EstadoCotizacion,
  EstadoOrdenCompra,
  EstadoRequerimiento,
  EstadoSolicitud,
  TipoOrdenCompra,
  TipoRequerimiento,
} from '../../prisma/types.js';

export const ORIGENES_SOLICITUD = ['macro', 'precotizado'] as const;
export type OrigenSolicitud = (typeof ORIGENES_SOLICITUD)[number];

export const VISTAS_SOLICITUD = ['todas', 'activas', 'historial'] as const;
export type VistaSolicitud = (typeof VISTAS_SOLICITUD)[number];

export const ETAPAS_SOLICITUD = [
  'borrador',
  'validacion_tecnica',
  'observada',
  'aprobada_requerimiento',
  'en_cotizacion',
  'aprobada_tecnico',
  'aprobada_gerencia',
  'emitida',
  'recibida_parcial',
  'pendiente_conformidad',
  'recibida',
  'cancelada',
  'mixta',
] as const;
export type EtapaSolicitud = (typeof ETAPAS_SOLICITUD)[number];

export const COLUMNAS_KANBAN_SOLICITUD = [
  'requiere_correccion',
  'validacion_tecnica',
  'cotizacion_seleccion',
  'aprobacion_gerencia',
  'por_emitir',
  'compra_curso',
  'recepcion_conformidad',
] as const;
export type ColumnaKanbanSolicitud = (typeof COLUMNAS_KANBAN_SOLICITUD)[number];

export interface ConteoEstados<T extends string> {
  total: number;
  porEstado: Partial<Record<T, number>>;
}

export interface FlujoMacroSolicitud {
  origen: 'macro';
  requerimiento: {
    estado: EstadoRequerimiento;
    urgente: boolean;
    notaRevision: string | null;
    fechaEntregaRequerida: string | null;
    items: number;
  };
  solicitudesCotizacion: Array<{
    id: string;
    codigo: string;
    estado: EstadoSolicitud;
    cotizaciones: ConteoEstados<EstadoCotizacion>;
    ordenes: ConteoEstados<EstadoOrdenCompra>;
  }>;
}

export interface GrupoPrecotizadoResumen {
  id: string;
  numero: string;
  nombre: string | null;
  tipoOrden: TipoOrdenCompra;
  estado: EstadoOrdenCompra;
  estadoAprobacion: EstadoAprobacionCompra | null;
  proveedor: {
    id: string | null;
    nombre: string;
  } | null;
  montoTotal: number;
  items: number;
  pagos: number;
  archivos: number;
}

export interface FlujoPrecotizadoSolicitud {
  origen: 'precotizado';
  esRendicion: boolean;
  grupos: GrupoPrecotizadoResumen[];
  aprobaciones: ConteoEstados<EstadoAprobacionCompra>;
  ordenes: ConteoEstados<EstadoOrdenCompra>;
  montoTotal: number;
}

export type FlujoSolicitud = FlujoMacroSolicitud | FlujoPrecotizadoSolicitud;

export interface SolicitudResumen {
  id: string;
  origen: OrigenSolicitud;
  tipo: TipoRequerimiento;
  codigo: string;
  nombre: string;
  proyecto: {
    id: string;
    codigo: string | null;
    nombre: string;
  };
  creadoPor: {
    id: string;
    name: string;
  };
  creadoEn: string;
  etapa: EtapaSolicitud;
  columnaKanban: ColumnaKanbanSolicitud | null;
  estadoNativo: string;
  requiereAtencion: boolean;
  esTerminal: boolean;
  hrefDetalle: string;
  flujo: FlujoSolicitud;
  resumenGrupos?: {
    total: number;
    pendientes: number;
    observados: number;
  };
}
