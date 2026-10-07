import type { NivelAccesoModulo, Role } from '../../prisma/types.js';

// Módulos funcionales sobre los que se configura acceso. Las claves coinciden con
// las rutas del dashboard (/proyectos, /pagos, ...). Inicio, notificaciones y
// ayuda quedan fuera: son transversales y los ve todo usuario autenticado.
export const MODULOS = [
  { key: 'proyectos', label: 'Proyectos' },
  { key: 'asistencia', label: 'Asistencia' },
  { key: 'solicitudes', label: 'Solicitudes y requerimientos' },
  { key: 'cotizaciones', label: 'Cotizaciones' },
  { key: 'ordenes', label: 'Órdenes de compra/servicio' },
  { key: 'almacenes', label: 'Almacenes e inventario' },
  { key: 'proveedores', label: 'Proveedores' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'cobros', label: 'Cobros' },
  { key: 'planilla', label: 'Planilla' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'trabajadores', label: 'Trabajadores' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'usuarios', label: 'Usuarios' },
] as const;

export type ModuloKey = (typeof MODULOS)[number]['key'];
export type NivelAcceso = NivelAccesoModulo;

export const MODULO_KEYS: readonly ModuloKey[] = MODULOS.map((m) => m.key);
export const NIVELES_ACCESO: readonly NivelAcceso[] = [
  'ninguno',
  'ver',
  'editar',
];

// Roles configurables en la matriz. admin_ti queda fuera: tiene acceso total
// fijo, igual que en RolesGuard.
export const ROLES_CONFIGURABLES: readonly Role[] = [
  'administrador',
  'gerencia',
  'logistica',
  'supervisor',
  'supervisor_civil',
  'supervisor_electrico',
  'pdr',
  'ing_civil',
  'ing_electrico',
  'jefe_sig',
  'coordinador_ssoma',
  'tesoreria',
];

const ORDEN: Record<NivelAcceso, number> = { ninguno: 0, ver: 1, editar: 2 };

export function esModulo(valor: string): valor is ModuloKey {
  return (MODULO_KEYS as readonly string[]).includes(valor);
}

/** Editar implica ver: el nivel otorgado alcanza si es igual o mayor al requerido. */
export function nivelAlcanza(otorgado: NivelAcceso, requerido: NivelAcceso) {
  return ORDEN[otorgado] >= ORDEN[requerido];
}

/** Lecturas (GET/HEAD) piden "ver"; todo lo demás pide "editar". */
export function nivelPorMetodo(
  method: string,
): Exclude<NivelAcceso, 'ninguno'> {
  return method === 'GET' || method === 'HEAD' ? 'ver' : 'editar';
}

export function etiquetaModulo(modulo: ModuloKey) {
  return MODULOS.find((m) => m.key === modulo)?.label ?? modulo;
}
