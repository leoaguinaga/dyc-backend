import { SetMetadata } from '@nestjs/common';

export const REQUIRE_RESPONSABLE_ASISTENCIA_KEY =
  'requireResponsableAsistencia';

/**
 * Exige que el usuario autenticado sea el trabajador encargado de tomar la
 * asistencia en la obra identificada por el parámetro de ruta `proyectoId`.
 * Hoy ese encargado es el prevencionista de riesgo (Proyecto.prevencionistaId) —
 * confirmado por el stakeholder el 2026-07-31. Se nombra en genérico porque
 * quién ocupa ese rol ya cambió una vez en esta misma semana de planificación;
 * si vuelve a cambiar, solo se ajusta ResponsableAsistenciaGuard, no cada uso
 * del decorador. Administrador y gerencia siempre pasan (ver el guard).
 */
export const RequireResponsableAsistencia = () =>
  SetMetadata(REQUIRE_RESPONSABLE_ASISTENCIA_KEY, true);
