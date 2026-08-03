import { EstadoCotizacion } from '../../../../prisma/types.js';
import type { ReporteEntidadMeta } from '../tipos.js';

export const COTIZACION_META: ReporteEntidadMeta = {
  entidad: 'cotizacion',
  label: 'Cotizaciones',
  modeloPrisma: 'cotizacion',
  campoFechaDefault: 'creadoEn',
  campos: [
    { key: 'id', label: 'ID', tipo: 'string', path: ['id'], operadores: ['eq', 'in'], metrica: true },
    {
      key: 'estado',
      label: 'Estado',
      tipo: 'enum',
      path: ['estado'],
      enumValues: Object.values(EstadoCotizacion),
      operadores: ['eq', 'neq', 'in'],
      agrupable: true,
    },
    { key: 'validezDias', label: 'Validez (días)', tipo: 'number', path: ['validezDias'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte'], metrica: true },
    { key: 'incluyeIgv', label: 'Incluye IGV', tipo: 'boolean', path: ['incluyeIgv'], operadores: ['eq'], agrupable: true },
    { key: 'fechaRecibida', label: 'Fecha recibida', tipo: 'date', path: ['fechaRecibida'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
    { key: 'fechaEntrega', label: 'Fecha de entrega', tipo: 'date', path: ['fechaEntrega'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
    { key: 'creadoEn', label: 'Creado en', tipo: 'date', path: ['creadoEn'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
    {
      key: 'proveedorId',
      label: 'Proveedor',
      tipo: 'relacion',
      path: ['proveedorId'],
      operadores: ['eq', 'in'],
      relacion: { entidad: 'proveedor', labelField: 'razonSocial' },
    },
    { key: 'proveedor.razonSocial', label: 'Proveedor — razón social', tipo: 'string', path: ['proveedor', 'razonSocial'], operadores: ['contains', 'eq'], agrupable: true },
    {
      key: 'solicitudId',
      label: 'Solicitud de cotización',
      tipo: 'relacion',
      path: ['solicitudId'],
      operadores: ['eq', 'in'],
      relacion: { entidad: 'solicitudCotizacion', labelField: 'codigo' },
    },
    { key: 'solicitud.codigo', label: 'Solicitud — código', tipo: 'string', path: ['solicitud', 'codigo'], operadores: ['contains', 'eq'], agrupable: true },
  ],
};
