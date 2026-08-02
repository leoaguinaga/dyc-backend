import { EstadoSolicitud } from '../../../../prisma/types.js';
import type { ReporteEntidadMeta } from '../tipos.js';

export const SOLICITUD_COTIZACION_META: ReporteEntidadMeta = {
  entidad: 'solicitudCotizacion',
  label: 'Solicitudes de cotización',
  modeloPrisma: 'solicitudCotizacion',
  campoFechaDefault: 'creadoEn',
  campos: [
    { key: 'id', label: 'ID', tipo: 'string', path: ['id'], operadores: ['eq', 'in'], metrica: true },
    { key: 'codigo', label: 'Código', tipo: 'string', path: ['codigo'], operadores: ['eq', 'contains', 'in'] },
    {
      key: 'estado',
      label: 'Estado',
      tipo: 'enum',
      path: ['estado'],
      enumValues: Object.values(EstadoSolicitud),
      operadores: ['eq', 'neq', 'in'],
      agrupable: true,
    },
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
    {
      key: 'requerimientoId',
      label: 'Requerimiento',
      tipo: 'relacion',
      path: ['requerimientoId'],
      operadores: ['eq', 'in'],
      relacion: { entidad: 'requerimiento', labelField: 'codigo' },
    },
    { key: 'requerimiento.codigo', label: 'Requerimiento — código', tipo: 'string', path: ['requerimiento', 'codigo'], operadores: ['contains', 'eq'], agrupable: true },
  ],
};
