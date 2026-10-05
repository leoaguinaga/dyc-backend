import { SetMetadata } from '@nestjs/common';
import type { ModuloKey } from '../../modules/rbac/modulos.js';

export const MODULO_KEY = 'modulo';
export const NIVEL_MODULO_KEY = 'nivelModulo';

/**
 * Asigna el controlador (o un endpoint puntual) a un módulo funcional. Si hay una
 * excepción de acceso configurada para ese módulo, RolesGuard la usa en lugar de
 * @Roles; sin excepción, @Roles sigue mandando.
 */
export const Modulo = (modulo: ModuloKey) => SetMetadata(MODULO_KEY, modulo);

/** Saca un endpoint del módulo de su controlador (p. ej. GET /users/me). */
export const SinModulo = () => SetMetadata(MODULO_KEY, null);

/**
 * Nivel que pide el endpoint cuando el método HTTP no lo refleja, como un POST
 * que solo consulta (reportes dinámicos).
 */
export const NivelModulo = (nivel: 'ver' | 'editar') =>
  SetMetadata(NIVEL_MODULO_KEY, nivel);
