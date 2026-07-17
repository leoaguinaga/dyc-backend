export const AppEvents = {
  // Cotizaciones (Fase 3)
  COTIZACION_ESTADO_CAMBIADO: 'cotizacion.estado_cambiado',
  COTIZACION_RECIBIDA: 'cotizacion.recibida',

  // Inventario (Fase 2)
  INVENTARIO_STOCK_BAJO: 'inventario.stock_bajo',

  // Requerimientos
  REQUERIMIENTO_CREADO: 'requerimiento.creado',
  REQUERIMIENTO_ESTADO_CAMBIADO: 'requerimiento.estado_cambiado',

  // Órdenes de compra
  ORDEN_COMPRA_GENERADA: 'orden_compra.generada',

  // Proyectos / obras
  OBRA_CERRADA: 'obra.cerrada',
} as const;
