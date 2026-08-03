import { EstadoRequerimiento, TipoRequerimiento } from '../../../../prisma/types.js';
import type { ReporteEntidadMeta } from '../tipos.js';

export const REQUERIMIENTO_META: ReporteEntidadMeta = {
  entidad: 'requerimiento',
  label: 'Requerimientos',
  modeloPrisma: 'requerimiento',
  campoFechaDefault: 'creadoEn',
  campos: [
    { key: 'id', label: 'ID', tipo: 'string', path: ['id'], operadores: ['eq', 'in'], metrica: true },
    { key: 'codigo', label: 'Código', tipo: 'string', path: ['codigo'], operadores: ['eq', 'contains', 'in'] },
    { key: 'nombre', label: 'Nombre', tipo: 'string', path: ['nombre'], operadores: ['contains', 'eq'] },
    {
      key: 'estado',
      label: 'Estado',
      tipo: 'enum',
      path: ['estado'],
      enumValues: Object.values(EstadoRequerimiento),
      operadores: ['eq', 'neq', 'in'],
      agrupable: true,
    },
    {
      key: 'tipo',
      label: 'Tipo',
      tipo: 'enum',
      path: ['tipo'],
      enumValues: Object.values(TipoRequerimiento),
      operadores: ['eq', 'neq', 'in'],
      agrupable: true,
    },
    { key: 'urgente', label: 'Urgente', tipo: 'boolean', path: ['urgente'], operadores: ['eq'], agrupable: true },
    { key: 'fechaEntregaRequerida', label: 'Fecha de entrega requerida', tipo: 'date', path: ['fechaEntregaRequerida'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
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
      key: 'creadoPorId',
      label: 'Creado por',
      tipo: 'relacion',
      path: ['creadoPorId'],
      operadores: ['eq', 'in'],
      relacion: { entidad: 'usuario', labelField: 'name' },
    },
  ],
};
