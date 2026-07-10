import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from '../../shared/events/events.js';
import { NotificacionesService } from './notificaciones.service.js';

const APROBADORES_REQUERIMIENTO = ['ing_civil', 'ing_electrico', 'jefe_sig', 'logistica', 'gerencia', 'administrador'] as const;
const GESTORES_COTIZACION = ['administrador', 'logistica', 'gerencia'] as const;
const GESTORES_OC = ['logistica', 'gerencia', 'administrador'] as const;

export interface RequerimientoCreadoPayload {
  requerimientoId: string;
  codigo: string;
  nombre: string;
}

export interface RequerimientoEstadoCambiadoPayload {
  requerimientoId: string;
  codigo: string;
  nombre: string;
  estado: 'aprobado' | 'observado';
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
  async onRequerimientoEstadoCambiado(payload: RequerimientoEstadoCambiadoPayload) {
    await this.service.crearParaUsuarios([payload.creadoPorId], {
      tipo: payload.estado === 'aprobado' ? 'requerimiento_aprobado' : 'requerimiento_observado',
      titulo: payload.estado === 'aprobado' ? 'Requerimiento aprobado' : 'Requerimiento observado',
      mensaje: `Tu requerimiento ${payload.codigo} — ${payload.nombre} fue ${payload.estado}.`,
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
}
