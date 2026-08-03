import type { ReporteEntidadMeta } from '../tipos.js';

export const CLIENTE_META: ReporteEntidadMeta = {
  entidad: 'cliente',
  label: 'Clientes',
  modeloPrisma: 'cliente',
  campoFechaDefault: 'creadoEn',
  campos: [
    { key: 'id', label: 'ID', tipo: 'string', path: ['id'], operadores: ['eq', 'in'], metrica: true },
    { key: 'razonSocial', label: 'Razón social', tipo: 'string', path: ['razonSocial'], operadores: ['contains', 'eq'] },
    { key: 'nombreComercial', label: 'Nombre comercial', tipo: 'string', path: ['nombreComercial'], operadores: ['contains', 'eq'] },
    { key: 'ruc', label: 'RUC', tipo: 'string', path: ['ruc'], operadores: ['eq', 'contains'] },
    { key: 'direccion', label: 'Dirección', tipo: 'string', path: ['direccion'], operadores: ['contains'] },
    { key: 'activo', label: 'Activo', tipo: 'boolean', path: ['activo'], operadores: ['eq'], agrupable: true },
    { key: 'creadoEn', label: 'Creado en', tipo: 'date', path: ['creadoEn'], operadores: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] },
  ],
};
