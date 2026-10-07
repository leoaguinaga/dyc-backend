import ExcelJS from 'exceljs';
import { CLAVES_REQUERIDAS, COLUMNAS, claveDeEncabezado } from './columnas.js';
import type { ClaveColumna } from './columnas.js';

/** Una fila del Excel tal como viene: los valores crudos, sin interpretar. */
export interface FilaCruda {
  /** Número de fila en la hoja (el que ve el usuario en Excel). */
  fila: number;
  valores: Partial<Record<ClaveColumna, unknown>>;
}

export interface LecturaXlsx {
  hoja: string;
  filas: FilaCruda[];
  /** Columnas opcionales que el archivo no trae (se avisa, no se falla). */
  columnasOpcionalesAusentes: string[];
}

const FILAS_BUSQUEDA_ENCABEZADO = 15;
const MIN_COLUMNAS_RECONOCIDAS = 5;

/** Valor plano de una celda de exceljs (fórmulas, texto enriquecido, hipervínculos). */
export function valorCelda(valor: ExcelJS.CellValue): unknown {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'object' || valor instanceof Date) return valor;
  if ('richText' in valor) return valor.richText.map((t) => t.text).join('');
  if ('result' in valor)
    return valor.result === undefined ? null : valorCelda(valor.result);
  if ('text' in valor) return valor.text;
  if ('error' in valor) return null;
  return null;
}

function esVacio(valor: unknown): boolean {
  return (
    valor === null ||
    valor === undefined ||
    (typeof valor === 'string' && valor.trim() === '')
  );
}

/**
 * Lee la hoja de pagos de un xlsx. Busca la fila de encabezados en las
 * primeras filas (el Excel de tesorería puede traer títulos arriba) y
 * reconoce las columnas por nombre, no por posición, así que el orden o
 * columnas extra no rompen la carga.
 *
 * Sin `hoja`, usa "Pagos" si existe; si no, la primera hoja que tenga todas las
 * columnas obligatorias (un libro con catálogos como "DATOS" no se confunde con
 * la lista de pagos). Con `hoja`, lee solo esa.
 */
export async function leerXlsx(
  origen: string | Buffer,
  opciones: { hoja?: string } = {},
): Promise<LecturaXlsx> {
  const libro = new ExcelJS.Workbook();
  if (typeof origen === 'string') await libro.xlsx.readFile(origen);
  else await libro.xlsx.load(origen as unknown as ArrayBuffer);

  let hojas = [...libro.worksheets].sort(
    (a, b) =>
      Number(/^pagos$/i.test(b.name.trim())) -
      Number(/^pagos$/i.test(a.name.trim())),
  );
  if (opciones.hoja) {
    const pedida = opciones.hoja.trim().toLowerCase();
    hojas = hojas.filter((h) => h.name.trim().toLowerCase() === pedida);
    if (!hojas.length) {
      throw new Error(
        `No existe la hoja "${opciones.hoja}". Hojas del libro: ${libro.worksheets.map((h) => `"${h.name}"`).join(', ')}`,
      );
    }
  }

  let primerError: Error | null = null;
  for (const hoja of hojas) {
    const encabezado = buscarEncabezado(hoja);
    if (!encabezado) continue;
    try {
      return extraerFilas(hoja, encabezado.fila, encabezado.columnas);
    } catch (err) {
      primerError ??= err as Error;
    }
  }
  if (primerError) throw primerError;
  throw new Error(
    `No encontré la fila de encabezados. Debe incluir al menos ${MIN_COLUMNAS_RECONOCIDAS} de estas columnas: ${COLUMNAS.map((c) => c.encabezado).join(', ')}`,
  );
}

function buscarEncabezado(
  hoja: ExcelJS.Worksheet,
): { fila: number; columnas: Map<number, ClaveColumna> } | null {
  const limite = Math.min(hoja.rowCount, FILAS_BUSQUEDA_ENCABEZADO);
  for (let numero = 1; numero <= limite; numero++) {
    const columnas = new Map<number, ClaveColumna>();
    const vistas = new Set<ClaveColumna>();
    hoja.getRow(numero).eachCell({ includeEmpty: false }, (celda, columna) => {
      const clave = claveDeEncabezado(valorCelda(celda.value));
      if (clave && !vistas.has(clave)) {
        vistas.add(clave);
        columnas.set(columna, clave);
      }
    });
    if (columnas.size >= MIN_COLUMNAS_RECONOCIDAS)
      return { fila: numero, columnas };
  }
  return null;
}

function extraerFilas(
  hoja: ExcelJS.Worksheet,
  filaEncabezado: number,
  columnas: Map<number, ClaveColumna>,
): LecturaXlsx {
  const presentes = new Set(columnas.values());
  const faltantes = CLAVES_REQUERIDAS.filter((c) => !presentes.has(c));
  if (!presentes.has('comprobante') && !presentes.has('subComprobante'))
    faltantes.push('comprobante');
  if (faltantes.length) {
    const nombres = faltantes.map(
      (c) => COLUMNAS.find((col) => col.clave === c)!.encabezado,
    );
    throw new Error(
      `Faltan columnas obligatorias en la hoja "${hoja.name}": ${nombres.join(', ')}`,
    );
  }

  const filas: FilaCruda[] = [];
  for (let numero = filaEncabezado + 1; numero <= hoja.rowCount; numero++) {
    const row = hoja.getRow(numero);
    const valores: Partial<Record<ClaveColumna, unknown>> = {};
    let hayDatos = false;
    for (const [columna, clave] of columnas) {
      const valor = valorCelda(row.getCell(columna).value);
      valores[clave] = valor;
      if (!esVacio(valor)) hayDatos = true;
    }
    if (hayDatos) filas.push({ fila: numero, valores });
  }

  const ausentes = COLUMNAS.filter(
    (c) => !presentes.has(c.clave) && !CLAVES_REQUERIDAS.includes(c.clave),
  ).map((c) => c.encabezado);
  return { hoja: hoja.name, filas, columnasOpcionalesAusentes: ausentes };
}
