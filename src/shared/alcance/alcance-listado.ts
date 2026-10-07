import type { Role, TipoRequerimiento } from '../../prisma/types.js';

// Los listados (tabla/kanban) de requerimientos, solicitudes y cotizaciones
// aceptan `?alcance=rol` para mostrar solo lo que le corresponde trabajar al
// rol del usuario. Es opt-in a propósito: los selectores y reportes que
// consumen los mismos endpoints siguen recibiendo la lista completa.
//
// Esto NO es control de acceso: los endpoints de detalle por id no se filtran,
// así que un enlace o notificación hacia un registro fuera del alcance abre
// sin problema.
export const ALCANCE_ROL = 'rol';
export const ALCANCES_LISTADO = [ALCANCE_ROL] as const;
export type AlcanceListado = (typeof ALCANCES_LISTADO)[number];

// Tipos de requerimiento que cada rol ve listados. Los roles que no aparecen
// (logística, administrador, admin_ti, gerencia, supervisores) no se filtran
// por tipo.
const TIPOS_LISTADOS_POR_ROL: Partial<Record<Role, TipoRequerimiento[]>> = {
  ing_civil: ['civil', 'electrico'],
  ing_electrico: ['civil', 'electrico'],
  jefe_sig: ['seguridad', 'administrativo'],
  coordinador_ssoma: ['seguridad'],
};

/** Tipos que el rol ve en los listados, o null si ve todos. */
export function tiposListadosPorRol(
  alcance: AlcanceListado | undefined,
  role: Role,
): TipoRequerimiento[] | null {
  if (alcance !== ALCANCE_ROL) return null;
  return TIPOS_LISTADOS_POR_ROL[role] ?? null;
}

/**
 * Gerencia solo ve en sus listados activos lo que espera su aprobación de
 * compra (solicitud en "aprobada_solicitante" o grupo precotizado en
 * "aprobada_tecnico"). Sus historiales no se acotan.
 */
export function soloPendienteGerencia(
  alcance: AlcanceListado | undefined,
  role: Role,
): boolean {
  return alcance === ALCANCE_ROL && role === 'gerencia';
}
