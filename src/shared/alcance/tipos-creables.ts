import type { Role, TipoRequerimiento } from '../../prisma/types.js';

const TODOS_LOS_TIPOS: TipoRequerimiento[] = [
  'civil',
  'electrico',
  'seguridad',
  'administrativo',
];

// Tipos de requerimiento que cada rol puede CREAR. Aplica igual al macro
// requerimiento (`POST /requerimientos`) y al precotizado
// (`POST /compras-simples`). El dashboard replica este mapa en
// `lib/requerimientos.ts` para armar el selector de tipo: si cambia aquí,
// cambiarlo allá.
//
// `supervisor` (rol genérico) no tiene una regla propia y conserva todos los
// tipos, igual que antes.
const TIPOS_CREABLES_POR_ROL: Partial<Record<Role, TipoRequerimiento[]>> = {
  jefe_sig: ['seguridad'],
  coordinador_ssoma: ['seguridad'],
  pdr: ['seguridad'],
  ing_electrico: ['electrico', 'seguridad'],
  supervisor_electrico: ['electrico', 'seguridad'],
  ing_civil: ['civil', 'electrico'],
  supervisor_civil: ['civil', 'electrico'],
  supervisor: TODOS_LOS_TIPOS,
  logistica: TODOS_LOS_TIPOS,
  gerencia: TODOS_LOS_TIPOS,
  administrador: TODOS_LOS_TIPOS,
  admin_ti: TODOS_LOS_TIPOS,
};

/** Tipos que el rol puede crear (vacío si el rol no crea requerimientos). */
export function tiposCreablesPorRol(role: Role): TipoRequerimiento[] {
  return TIPOS_CREABLES_POR_ROL[role] ?? [];
}

export function puedeCrearTipo(role: Role, tipo: TipoRequerimiento): boolean {
  return tiposCreablesPorRol(role).includes(tipo);
}
