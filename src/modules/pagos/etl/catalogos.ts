import ExcelJS from 'exceljs';
import { compactar } from '../importacion/columnas.js';
import { valorCelda } from '../importacion/lector-xlsx.js';
import { limpiar } from '../importacion/normalizacion.js';

/**
 * Catálogos oficiales que tesorería mantiene en la hoja DATOS del Excel:
 * son la fuente de verdad para validar y completar la lista maestra.
 */
export interface CatalogosDatos {
  centros: { codigo: string; descripcion: string }[];
  proveedores: { nombre: string; cuentas: string[] }[];
  tiposGasto: string[];
  responsables: string[];
  empresas: { razonSocial: string; ruc: string }[];
  tiposOperacion: string[];
}

const FILAS_BUSQUEDA = 12;

function texto(hoja: ExcelJS.Worksheet, fila: number, columna: number): string {
  const valor = valorCelda(hoja.getRow(fila).getCell(columna).value);
  if (valor === null || valor === undefined) return '';
  // Las cuentas largas pueden venir como número: se pasan a texto sin notación científica.
  if (typeof valor === 'number')
    return Number.isInteger(valor)
      ? valor.toLocaleString('fullwide', { useGrouping: false })
      : String(valor);
  return limpiar(valor);
}

/** Columna (1-based) cuyo encabezado, sin acentos ni símbolos, empieza por `prefijo`, buscando en las primeras filas. */
function buscarColumna(
  hoja: ExcelJS.Worksheet,
  prefijo: string,
): { fila: number; columna: number } | null {
  for (let fila = 1; fila <= Math.min(hoja.rowCount, FILAS_BUSQUEDA); fila++) {
    for (let columna = 1; columna <= hoja.columnCount; columna++) {
      if (compactar(texto(hoja, fila, columna)).startsWith(prefijo))
        return { fila, columna };
    }
  }
  return null;
}

/** Valores de una columna de catálogo, desde la fila siguiente al encabezado, sin vacíos ni repetidos. */
function listar(
  hoja: ExcelJS.Worksheet,
  ancla: { fila: number; columna: number } | null,
  excluir: string[] = [],
): string[] {
  if (!ancla) return [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  const omitidos = new Set(excluir.map(compactar));
  for (let fila = ancla.fila + 1; fila <= hoja.rowCount; fila++) {
    const valor = texto(hoja, fila, ancla.columna);
    const llave = compactar(valor);
    if (!valor || omitidos.has(llave) || vistos.has(llave)) continue;
    vistos.add(llave);
    salida.push(valor);
  }
  return salida;
}

/**
 * Lee los catálogos de la hoja DATOS (centros de costo, proveedores con su cuenta,
 * tipos de gasto, responsables, empresas, tipos de operación). Devuelve null si el
 * libro no tiene esa hoja: el ETL funciona igual, solo sin validación contra catálogo.
 */
export async function leerCatalogos(
  ruta: string,
  nombreHoja = 'DATOS',
): Promise<CatalogosDatos | null> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hoja = libro.worksheets.find(
    (h) => h.name.trim().toLowerCase() === nombreHoja.toLowerCase(),
  );
  if (!hoja) return null;

  const centroAncla = buscarColumna(hoja, 'CENTRODECOSTO');
  const proveedorAncla = buscarColumna(hoja, 'PROVEEDORES');
  const cuentaProveedorAncla = buscarColumna(hoja, 'NUMERODECUENTA');
  const empresaAncla = buscarColumna(hoja, 'RAZONSOCIAL');

  const centros: CatalogosDatos['centros'] = [];
  if (centroAncla) {
    const vistos = new Set<string>();
    for (let fila = centroAncla.fila + 1; fila <= hoja.rowCount; fila++) {
      const codigo = texto(hoja, fila, centroAncla.columna);
      const llave = compactar(codigo);
      if (!codigo || vistos.has(llave)) continue;
      vistos.add(llave);
      centros.push({
        codigo,
        descripcion: texto(hoja, fila, centroAncla.columna + 1),
      });
    }
  }

  const proveedores = new Map<string, { nombre: string; cuentas: string[] }>();
  if (proveedorAncla) {
    const columnaCuenta =
      cuentaProveedorAncla?.columna ?? proveedorAncla.columna + 1;
    for (let fila = proveedorAncla.fila + 1; fila <= hoja.rowCount; fila++) {
      const nombre = texto(hoja, fila, proveedorAncla.columna);
      if (!nombre) continue;
      const cuenta = texto(hoja, fila, columnaCuenta);
      const existente = proveedores.get(compactar(nombre)) ?? {
        nombre,
        cuentas: [],
      };
      if (
        cuenta &&
        !existente.cuentas.some((c) => compactar(c) === compactar(cuenta))
      )
        existente.cuentas.push(cuenta);
      proveedores.set(compactar(nombre), existente);
    }
  }

  const empresas: CatalogosDatos['empresas'] = [];
  if (empresaAncla) {
    for (let fila = empresaAncla.fila + 1; fila <= hoja.rowCount; fila++) {
      const razonSocial = texto(hoja, fila, empresaAncla.columna);
      const ruc = texto(hoja, fila, empresaAncla.columna + 1).replace(
        /\D/g,
        '',
      );
      if (razonSocial && ruc) empresas.push({ razonSocial, ruc });
    }
  }

  return {
    centros,
    proveedores: [...proveedores.values()],
    tiposGasto: listar(hoja, buscarColumna(hoja, 'TIPODEGASTO')),
    // La primera celda de la lista repite el rótulo de la columna ("RESPONSABLE DE LA RENDICION").
    responsables: listar(
      hoja,
      buscarColumna(hoja, 'RESPONSABLEDELARENDICION'),
      ['RESPONSABLE DE LA RENDICION'],
    ),
    empresas,
    tiposOperacion: listar(hoja, buscarColumna(hoja, 'TIPODEOPERACION')),
  };
}
