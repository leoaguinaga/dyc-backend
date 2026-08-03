import type { QueryReporteDinamicoDto } from '../dto/query-reporte-dinamico.dto.js';

/**
 * Configuraciones fijas del equipo que reproducen los 3 reportes legacy sobre el motor
 * genérico. No son reportes guardados por el usuario (eso queda diferido a una iteración
 * futura) — viven en código y corren contra POST /reportes/query.
 */
export const PRESETS_REPORTES: Record<string, QueryReporteDinamicoDto> = {
  'gasto-por-proyecto': {
    entidad: 'ordenCompra',
    agruparPor: ['proyecto.codigo', 'proyecto.nombre'],
    metricas: [
      { campo: 'id', funcion: 'count' },
      { campo: 'montoTotal', funcion: 'sum' },
    ],
  },
  'ocs-por-proveedor': {
    entidad: 'ordenCompra',
    agruparPor: ['proveedor.razonSocial'],
    metricas: [
      { campo: 'id', funcion: 'count' },
      { campo: 'montoTotal', funcion: 'sum' },
    ],
  },
  // Aproximación: el legacy separa "vencido" de "pendiente" comparando fechaProgramada
  // contra la fecha actual, algo que el motor genérico (agrupar + métrica) no expresa —
  // ese pivote específico queda fuera de alcance de este preset.
  'pagos-por-periodo': {
    entidad: 'pago',
    filtros: [{ campo: 'estado', operador: 'in', valor: ['pendiente', 'pagado'] }],
    agruparPor: ['mesProgramado', 'estado'],
    metricas: [{ campo: 'monto', funcion: 'sum' }],
  },
};
