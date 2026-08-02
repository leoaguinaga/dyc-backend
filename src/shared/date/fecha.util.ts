const TIMEZONE = 'America/Lima';

/**
 * "Hoy" calendario en hora de Lima, como Date a medianoche UTC (mismo
 * convenio que las columnas `@db.Date` del schema). Usar new Date() directo
 * y extraer con getters UTC computa "hoy" en UTC, no en Lima (UTC-5) — entre
 * ~19:00 y medianoche hora Lima eso ya cuenta como el día siguiente.
 */
export function hoyLima(): Date {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(
    new Date(),
  );
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Trunca un Date a solo su fecha (medianoche UTC), preservando el año/mes/día
 * ya presentes en el valor — para fechas explícitas (ya inequívocas, tipo
 * "YYYY-MM-DD" parseado), no para "ahora" (usar hoyLima() para eso).
 */
export function soloFechaUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
