import { BadRequestException } from '@nestjs/common';
import { ORDEN_COMPRA_META } from './entidades/orden-compra.entidad.js';
import { PAGO_META } from './entidades/pago.entidad.js';
import { REQUERIMIENTO_META } from './entidades/requerimiento.entidad.js';
import { SOLICITUD_COTIZACION_META } from './entidades/solicitud-cotizacion.entidad.js';
import { COTIZACION_META } from './entidades/cotizacion.entidad.js';
import { CLIENTE_META } from './entidades/cliente.entidad.js';
import { TRABAJADOR_META } from './entidades/trabajador.entidad.js';
import type { CampoReporte, ReporteEntidadMeta } from './tipos.js';

export const CATALOGO_REPORTES: Record<string, ReporteEntidadMeta> = {
  ordenCompra: ORDEN_COMPRA_META,
  pago: PAGO_META,
  requerimiento: REQUERIMIENTO_META,
  solicitudCotizacion: SOLICITUD_COTIZACION_META,
  cotizacion: COTIZACION_META,
  cliente: CLIENTE_META,
  trabajador: TRABAJADOR_META,
};

export function getEntidadMeta(entidad: string): ReporteEntidadMeta {
  const meta = CATALOGO_REPORTES[entidad];
  if (!meta) {
    throw new BadRequestException(`Entidad de reporte desconocida: "${entidad}"`);
  }
  return meta;
}

export function getCampoMeta(entidad: string, campoKey: string): CampoReporte {
  const meta = getEntidadMeta(entidad);
  const campo = meta.campos.find((c) => c.key === campoKey);
  if (!campo) {
    throw new BadRequestException(`Campo "${campoKey}" no existe en la entidad "${entidad}"`);
  }
  return campo;
}

export * from './tipos.js';
