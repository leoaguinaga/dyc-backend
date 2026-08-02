import type { ReporteEntidadMeta } from '../tipos.js';

export const TRABAJADOR_META: ReporteEntidadMeta = {
  entidad: 'trabajador',
  label: 'Trabajadores',
  modeloPrisma: 'trabajador',
  campoFechaDefault: 'creadoEn',
  campos: [
    { key: 'id', label: 'ID', tipo: 'string', path: ['id'], operadores: ['eq', 'in'], metrica: true },
    { key: 'nombre', label: 'Nombre', tipo: 'string', path: ['nombre'], operadores: ['contains', 'eq'] },
    { key: 'dni', label: 'DNI', tipo: 'string', path: ['dni'], operadores: ['eq', 'contains'] },
    { key: 'cargo', label: 'Cargo', tipo: 'string', path: ['cargo'], operadores: ['contains', 'eq'], agrupable: true },
    { key: 'telefono', label: 'Teléfono', tipo: 'string', path: ['telefono'], operadores: ['contains', 'eq'] },
    { key: 'email', label: 'Email', tipo: 'string', path: ['email'], operadores: ['contains', 'eq'] },
    { key: 'activo', label: 'Activo', tipo: 'boolean', path: ['activo'], operadores: ['eq'], agrupable: true },
    { key: 'creadoEn', label: 'Creado en', tipo: 'date', path: ['creadoEn'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
  ],
};
