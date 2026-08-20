import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from '../../shared/events/events.js';
import { NotificacionesService } from './notificaciones.service.js';
import type { TipoNotificacion } from '../../prisma/types.js';

const APROBADORES_REQUERIMIENTO = [
  'ing_civil',
  'ing_electrico',
  'jefe_sig',
  'logistica',
  'gerencia',
  'administrador',
  'admin_ti',
] as const;
const GESTORES_COTIZACION = ['administrador', 'admin_ti', 'logistica', 'gerencia'] as const;
const GESTORES_OC = ['logistica', 'gerencia', 'administrador', 'admin_ti'] as const;
const GESTORES_OBRA = ['gerencia', 'administrador', 'admin_ti'] as const;
const GESTORES_PLANILLA = ['gerencia', 'administrador', 'admin_ti'] as const;
const GESTORES_COMPRA_SIMPLE = ['gerencia', 'administrador', 'admin_ti'] as const;

// Aprobador técnico según el tipo de la compra simple (paso 1 — debe calzar
// con TIPO_APPROVERS_TECNICO en compras-simples.service.ts).
const APROBADOR_TECNICO_COMPRA_SIMPLE = {
  civil: ['ing_civil', 'administrador', 'admin_ti'],
  electrico: ['ing_electrico', 'administrador', 'admin_ti'],
  seguridad: ['jefe_sig', 'administrador', 'admin_ti'],
  administrativo: ['logistica', 'administrador', 'admin_ti'],
} as const;

export interface RequerimientoCreadoPayload {
  requerimientoId: string;
  codigo: string;
  nombre: string;
}

export interface RequerimientoEstadoCambiadoPayload {
  requerimientoId: string;
  codigo: string;
  nombre: string;
  estado:
    | 'aprobado'
    | 'observado'
    | 'en_cotizacion'
    | 'pendiente_conformidad'
    | 'recibido'
    | 'cancelado';
  creadoPorId: string;
}

export interface CotizacionRecibidaPayload {
  solicitudId: string;
  solicitudCodigo: string;
  proveedorNombre: string;
}

export interface CotizacionEstadoCambiadoPayload {
  solicitudId: string;
  solicitudCodigo: string;
  estado: string;
}

export interface OrdenCompraGeneradaPayload {
  ordenCompraId: string;
  numero: string;
  proveedorNombre: string;
}

export interface CompraSimpleCreadaPayload {
  compraSimpleId: string;
  compraSimpleCodigo: string;
  compraSimpleNombre: string;
  tipo: keyof typeof APROBADOR_TECNICO_COMPRA_SIMPLE;
}

export interface CompraSimpleAprobacionTecnicaPayload {
  grupoId: string;
  compraSimpleId: string;
  compraSimpleCodigo: string;
  compraSimpleNombre: string;
}

export interface ObraCerradaPayload {
  proyectoId: string;
  codigo: string | null;
  nombre: string;
  cerradoPorId: string;
}

export interface CobroCreadoPayload {
  cobroId: string;
  proyectoId: string;
  codigo: string | null;
  nombre: string;
  monto: number;
  fechaProgramada: Date;
}

export interface PlanillaGeneradaPayload {
  planillaId: string;
  proyectoId: string;
  proyectoNombre: string;
  periodoInicio: string;
  periodoFin: string;
  totalGeneral: string;
}

@Injectable()
export class NotificacionesListener {
  constructor(private service: NotificacionesService) {}

  @OnEvent(AppEvents.REQUERIMIENTO_CREADO)
  async onRequerimientoCreado(payload: RequerimientoCreadoPayload) {
    await this.service.crearParaRoles([...APROBADORES_REQUERIMIENTO], {
      tipo: 'requerimiento_creado',
      titulo: 'Nuevo requerimiento',
      mensaje: `Se creó el requerimiento ${payload.codigo} — ${payload.nombre}.`,
      entidadTipo: 'Requerimiento',
      entidadId: payload.requerimientoId,
    });
  }

  @OnEvent(AppEvents.REQUERIMIENTO_ESTADO_CAMBIADO)
  async onRequerimientoEstadoCambiado(
    payload: RequerimientoEstadoCambiadoPayload,
  ) {
    const PRESET: Record<
      RequerimientoEstadoCambiadoPayload['estado'],
      { tipo: TipoNotificacion; titulo: string; mensaje: string }
    > = {
      aprobado: {
        tipo: 'requerimiento_aprobado',
        titulo: 'Requerimiento aprobado',
        mensaje: `Tu requerimiento ${payload.codigo} — ${payload.nombre} fue aprobado.`,
      },
      observado: {
        tipo: 'requerimiento_observado',
        titulo: 'Requerimiento observado',
        mensaje: `Tu requerimiento ${payload.codigo} — ${payload.nombre} fue observado.`,
      },
      en_cotizacion: {
        tipo: 'requerimiento_en_cotizacion',
        titulo: 'Requerimiento en cotización',
        mensaje: `Tu requerimiento ${payload.codigo} — ${payload.nombre} ya tiene una solicitud de cotización en curso.`,
      },
      pendiente_conformidad: {
        tipo: 'requerimiento_pendiente_conformidad',
        titulo: 'Confirmá la recepción',
        mensaje: `La compra de tu requerimiento ${payload.codigo} — ${payload.nombre} ya fue recibida. Subí la foto y confirmá la recepción.`,
      },
      recibido: {
        tipo: 'requerimiento_recibido',
        titulo: 'Recepción confirmada',
        mensaje: `Confirmaste la recepción del requerimiento ${payload.codigo} — ${payload.nombre}.`,
      },
      cancelado: {
        tipo: 'requerimiento_cancelado',
        titulo: 'Requerimiento cancelado',
        mensaje: `Tu requerimiento ${payload.codigo} — ${payload.nombre} fue cancelado.`,
      },
    };
    const preset = PRESET[payload.estado];

    await this.service.crearParaUsuarios([payload.creadoPorId], {
      tipo: preset.tipo,
      titulo: preset.titulo,
      mensaje: preset.mensaje,
      entidadTipo: 'Requerimiento',
      entidadId: payload.requerimientoId,
    });
  }

  @OnEvent(AppEvents.COTIZACION_RECIBIDA)
  async onCotizacionRecibida(payload: CotizacionRecibidaPayload) {
    await this.service.crearParaRoles([...GESTORES_COTIZACION], {
      tipo: 'cotizacion_recibida',
      titulo: 'Cotización recibida',
      mensaje: `${payload.proveedorNombre} envió su cotización para la solicitud ${payload.solicitudCodigo}.`,
      entidadTipo: 'SolicitudCotizacion',
      entidadId: payload.solicitudId,
    });
  }

  @OnEvent(AppEvents.COTIZACION_ESTADO_CAMBIADO)
  async onCotizacionEstadoCambiado(payload: CotizacionEstadoCambiadoPayload) {
    if (payload.estado !== 'cotizada') return;
    await this.service.crearParaRoles([...GESTORES_COTIZACION], {
      tipo: 'solicitud_lista_adjudicar',
      titulo: 'Solicitud lista para adjudicar',
      mensaje: `Todas las cotizaciones de la solicitud ${payload.solicitudCodigo} están listas para comparar y adjudicar.`,
      entidadTipo: 'SolicitudCotizacion',
      entidadId: payload.solicitudId,
    });
  }

  @OnEvent(AppEvents.ORDEN_COMPRA_GENERADA)
  async onOrdenCompraGenerada(payload: OrdenCompraGeneradaPayload) {
    await this.service.crearParaRoles([...GESTORES_OC], {
      tipo: 'orden_compra_generada',
      titulo: 'Nueva orden de compra',
      mensaje: `Se generó la OC ${payload.numero} para ${payload.proveedorNombre}.`,
      entidadTipo: 'OrdenCompra',
      entidadId: payload.ordenCompraId,
    });
  }

  @OnEvent(AppEvents.COMPRA_SIMPLE_CREADA)
  async onCompraSimpleCreada(payload: CompraSimpleCreadaPayload) {
    await this.service.crearParaRoles(
      [...APROBADOR_TECNICO_COMPRA_SIMPLE[payload.tipo]],
      {
        tipo: 'compra_simple_pendiente_tecnico',
        titulo: 'Compra simple pendiente de aprobación técnica',
        mensaje: `La compra simple ${payload.compraSimpleCodigo} — ${payload.compraSimpleNombre} necesita tu aprobación técnica.`,
        entidadTipo: 'CompraSimple',
        entidadId: payload.compraSimpleId,
      },
    );
  }

  @OnEvent(AppEvents.COMPRA_SIMPLE_APROBACION_TECNICA)
  async onCompraSimpleAprobacionTecnica(
    payload: CompraSimpleAprobacionTecnicaPayload,
  ) {
    await this.service.crearParaRoles([...GESTORES_COMPRA_SIMPLE], {
      tipo: 'compra_simple_pendiente_gerencia',
      titulo: 'Compra simple pendiente de aprobación',
      mensaje: `La compra simple ${payload.compraSimpleCodigo} — ${payload.compraSimpleNombre} fue aprobada por el área técnica y necesita tu aprobación.`,
      entidadTipo: 'CompraSimple',
      entidadId: payload.compraSimpleId,
    });
  }

  @OnEvent(AppEvents.OBRA_CERRADA)
  async onObraCerrada(payload: ObraCerradaPayload) {
    await this.service.crearParaRoles([...GESTORES_OBRA], {
      tipo: 'obra_cerrada',
      titulo: 'Obra cerrada',
      mensaje: `La obra ${payload.codigo ?? payload.nombre} — ${payload.nombre} fue cerrada.`,
      entidadTipo: 'Proyecto',
      entidadId: payload.proyectoId,
    });
  }

  @OnEvent(AppEvents.COBRO_CREADO)
  async onCobroCreado(payload: CobroCreadoPayload) {
    const monto = payload.monto.toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });
    await this.service.crearParaRoles([...GESTORES_OBRA], {
      tipo: 'cobro_por_vencer',
      titulo: 'Nuevo cobro pendiente',
      mensaje: `Se registró un cobro de ${monto} para la obra ${payload.codigo ?? payload.nombre} — ${payload.nombre}, programado para el ${payload.fechaProgramada.toLocaleDateString('es-PE')}.`,
      entidadTipo: 'Cobro',
      entidadId: payload.cobroId,
    });
  }

  @OnEvent(AppEvents.PLANILLA_GENERADA)
  async onPlanillaGenerada(payload: PlanillaGeneradaPayload) {
    await this.service.crearParaRoles([...GESTORES_PLANILLA], {
      tipo: 'planilla_generada',
      titulo: 'Planilla generada',
      mensaje: `Se generó la planilla de ${payload.proyectoNombre} (${payload.periodoInicio} — ${payload.periodoFin}) por S/ ${payload.totalGeneral}.`,
      entidadTipo: 'Planilla',
      entidadId: payload.planillaId,
    });
  }
}
