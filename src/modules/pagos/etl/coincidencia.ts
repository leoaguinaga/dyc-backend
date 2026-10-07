import { clave, huellaPersona } from '../importacion/normalizacion.js';

/** Distancia de edición entre dos textos (inserciones, borrados y sustituciones). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(
        anterior[j] + 1,
        actual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    anterior = actual;
  }
  return anterior[b.length];
}

export type Coincidencia =
  | { tipo: 'exacto'; valor: string }
  | { tipo: 'orden'; valor: string }
  | { tipo: 'aproximado'; valor: string; distancia: number }
  | { tipo: 'ambiguo'; candidatos: string[] }
  | { tipo: 'ninguno' };

/**
 * Busca `nombre` en un catálogo tolerando mayúsculas, acentos, espacios y el
 * orden de las palabras ("PALMA MENDOZA CARLOS" = "Carlos Palma Mendoza").
 * Si no hay coincidencia exacta, acepta un único candidato a pocas letras de
 * distancia (SANCHES → SANCHEZ); con dos candidatos igual de cerca no decide.
 */
export function buscarEnCatalogo(
  nombre: string,
  catalogo: string[],
  maxDistancia: number,
): Coincidencia {
  const objetivo = clave(nombre);
  const exacto = catalogo.find((c) => clave(c) === objetivo);
  if (exacto) return { tipo: 'exacto', valor: exacto };

  const huella = huellaPersona(nombre);
  const mismoConjunto = catalogo.filter((c) => huellaPersona(c) === huella);
  if (mismoConjunto.length === 1)
    return { tipo: 'orden', valor: mismoConjunto[0] };
  if (mismoConjunto.length > 1)
    return { tipo: 'ambiguo', candidatos: mismoConjunto };

  // Con nombres muy cortos una letra de diferencia ya es otra persona/empresa.
  if (maxDistancia <= 0 || huella.length < 10) return { tipo: 'ninguno' };
  const cercanos = catalogo
    .map((c) => ({ c, d: levenshtein(huella, huellaPersona(c)) }))
    .filter((x) => x.d <= maxDistancia)
    .sort((x, y) => x.d - y.d);
  if (!cercanos.length) return { tipo: 'ninguno' };
  if (cercanos.length > 1 && cercanos[1].d === cercanos[0].d) {
    return {
      tipo: 'ambiguo',
      candidatos: cercanos.filter((x) => x.d === cercanos[0].d).map((x) => x.c),
    };
  }
  return { tipo: 'aproximado', valor: cercanos[0].c, distancia: cercanos[0].d };
}
