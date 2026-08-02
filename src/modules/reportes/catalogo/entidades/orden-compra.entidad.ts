import { EstadoOrdenCompra } from '../../../../prisma/types.js';
import type { ReporteEntidadMeta } from '../tipos.js';

export const ORDEN_COMPRA_META: ReporteEntidadMeta = {
  entidad: 'ordenCompra',
  label: 'Órdenes de compra',
  modeloPrisma: 'ordenCompra',
  campoFechaDefault: 'creadoEn',
  campos: [
    { key: 'id', label: 'ID', tipo: 'string', path: ['id'], operadores: ['eq', 'in'], metrica: true },
    { key: 'numero', label: 'Número', tipo: 'string', path: ['numero'], operadores: ['eq', 'contains', 'in'] },
    { key: 'nombre', label: 'Nombre', tipo: 'string', path: ['nombre'], operadores: ['contains', 'eq'] },
    {
      key: 'estado',
      label: 'Estado',
      tipo: 'enum',
      path: ['estado'],
      enumValues: Object.values(EstadoOrdenCompra),
      operadores: ['eq', 'neq', 'in'],
      agrupable: true,
    },
    { key: 'montoTotal', label: 'Monto total', tipo: 'decimal', path: ['montoTotal'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'], metrica: true },
    { key: 'calificacionCalidad', label: 'Calificación de calidad', tipo: 'number', path: ['calificacionCalidad'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte'], metrica: true },
    { key: 'incluyeIgv', label: 'Incluye IGV', tipo: 'boolean', path: ['incluyeIgv'], operadores: ['eq'], agrupable: true },
    { key: 'fechaEmision', label: 'Fecha de emisión', tipo: 'date', path: ['fechaEmision'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
    { key: 'fechaEntrega', label: 'Fecha de entrega', tipo: 'date', path: ['fechaEntrega'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
    { key: 'creadoEn', label: 'Creado en', tipo: 'date', path: ['creadoEn'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
    {
      key: 'proyectoId',
      label: 'Proyecto',
      tipo: 'relacion',
      path: ['proyectoId'],
      operadores: ['eq', 'in'],
      relacion: { entidad: 'proyecto', labelField: 'nombre' },
    },
    { key: 'proyecto.nombre', label: 'Proyecto — nombre', tipo: 'string', path: ['proyecto', 'nombre'], operadores: ['contains', 'eq'], agrupable: true },
    { key: 'proyecto.codigo', label: 'Proyecto — código', tipo: 'string', path: ['proyecto', 'codigo'], operadores: ['contains', 'eq'], agrupable: true },
    {
      key: 'proveedorId',
      label: 'Proveedor',
      tipo: 'relacion',
      path: ['proveedorId'],
      operadores: ['eq', 'in'],
      relacion: { entidad: 'proveedor', labelField: 'razonSocial' },
    },
    { key: 'proveedor.razonSocial', label: 'Proveedor — razón social', tipo: 'string', path: ['proveedor', 'razonSocial'], operadores: ['contains', 'eq'], agrupable: true },
  ],
};
