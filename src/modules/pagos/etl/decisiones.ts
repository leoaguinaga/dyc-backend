import { existsSync } from 'node:fs';
import ExcelJS from 'exceljs';
import {
  COLUMNAS,
  claveDeEncabezado,
  compactar,
} from '../importacion/columnas.js';
import type { ClaveColumna } from '../importacion/columnas.js';
import { valorCelda } from '../importacion/lector-xlsx.js';
import { claveCodigo, limpiar } from '../importacion/normalizacion.js';
import type {
  AccionCentro,
  Correccion,
  DecisionCentro,
  Excepcion,
  ResumenCentro,
} from './limpiador.js';

/**
 * Archivo de decisiones: lo único que hay que editar a mano. Tiene dos hojas:
 *  - "Centros de costo": qué hacer con cada centro del Excel (obra o administración)
 *    y con qué código existe en el sistema.
 *  - "Correcciones": celdas puntuales a corregir (comprobante + columna + valor nuevo).
 * Al volver a correr el ETL se leen; lo que ya decidiste no se pisa.
 */
const HOJA_CENTROS = 'Centros de costo';
const HOJA_CORRECCIONES = 'Correcciones';
const ACCIONES: AccionCentro[] = ['obra', 'administracion'];

export interface Decisiones {
  centros: Map<string, DecisionCentro>;
  correcciones: Correccion[];
}

function celda(hoja: ExcelJS.Worksheet, fila: number, columna: number): string {
  const v = valorCelda(hoja.getRow(fila).getCell(columna).value);
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return limpiar(v);
}

/** Índice de columna por encabezado (comparado sin acentos ni símbolos) en la fila 1. */
function columnasPorEncabezado(hoja: ExcelJS.Worksheet): Map<string, number> {
  const mapa = new Map<string, number>();
  hoja
    .getRow(1)
    .eachCell({ includeEmpty: false }, (c, i) =>
      mapa.set(compactar(valorCelda(c.value)), i),
    );
  return mapa;
}

export async function leerDecisiones(ruta: string): Promise<Decisiones> {
  const vacio: Decisiones = { centros: new Map(), correcciones: [] };
  if (!existsSync(ruta)) return vacio;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);

  const centros = new Map<string, DecisionCentro>();
  const hojaCentros = libro.getWorksheet(HOJA_CENTROS);
  if (hojaCentros) {
    const col = columnasPorEncabezado(hojaCentros);
    const c = (nombre: string) => col.get(compactar(nombre)) ?? 0;
    for (let fila = 2; fila <= hojaCentros.rowCount; fila++) {
      const codigoExcel = celda(hojaCentros, fila, c('CÓDIGO EN EL EXCEL'));
      if (!codigoExcel) continue;
      const accion = limpiar(
        celda(hojaCentros, fila, c('ACCIÓN')),
      ).toLowerCase();
      if (!ACCIONES.includes(accion as AccionCentro)) {
        throw new Error(
          `Decisiones, hoja "${HOJA_CENTROS}", fila ${fila}: la ACCIÓN de "${codigoExcel}" debe ser obra o administracion (dice "${accion}")`,
        );
      }
      const codigoSistema = celda(hojaCentros, fila, c('CÓDIGO EN EL SISTEMA'));
      if (accion === 'obra' && !codigoSistema) {
        throw new Error(
          `Decisiones, hoja "${HOJA_CENTROS}", fila ${fila}: falta el CÓDIGO EN EL SISTEMA de la obra "${codigoExcel}"`,
        );
      }
      centros.set(claveCodigo(codigoExcel), {
        codigoExcel,
        accion: accion as AccionCentro,
        codigoSistema:
          accion === 'administracion' ? 'ADMINISTRACION' : codigoSistema,
        nombre: celda(hojaCentros, fila, c('NOMBRE DE LA OBRA')),
        notas: celda(hojaCentros, fila, c('NOTAS')),
      });
    }
  }

  const correcciones: Correccion[] = [];
  const hojaCorrecciones = libro.getWorksheet(HOJA_CORRECCIONES);
  if (hojaCorrecciones) {
    const col = columnasPorEncabezado(hojaCorrecciones);
    const c = (nombre: string) => col.get(compactar(nombre)) ?? 0;
    for (let fila = 2; fila <= hojaCorrecciones.rowCount; fila++) {
      const comprobante = celda(hojaCorrecciones, fila, c('COMPROBANTE'));
      const nombreColumna = celda(hojaCorrecciones, fila, c('COLUMNA'));
      const valor = celda(hojaCorrecciones, fila, c('VALOR NUEVO'));
      if (!comprobante || !valor) continue; // fila sugerida y aún sin decidir
      const columna = claveDeEncabezado(nombreColumna);
      if (!columna) {
        throw new Error(
          `Decisiones, hoja "${HOJA_CORRECCIONES}", fila ${fila}: no reconozco la columna "${nombreColumna}"`,
        );
      }
      correcciones.push({ comprobante, columna, valor });
    }
  }
  return { centros, correcciones };
}

export interface DatosDecisiones {
  centros: ResumenCentro[];
  decisiones: Map<string, DecisionCentro>;
  correcciones: Correccion[];
  excepciones: Excepcion[];
  /** Códigos de obra (sin espacios, en mayúsculas) que ya existen en el sistema; null si no se consultó. */
  existentes: Set<string> | null;
  /** Fecha desde la que una obra se considera activa. */
  activaDesde: Date;
}

const AMARILLO = 'FFFFF2CC';
const ENCABEZADO = 'FF1A3557';

function estilarEncabezado(hoja: ExcelJS.Worksheet, editables: number[] = []) {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.alignment = { vertical: 'middle', wrapText: true };
  fila.height = 30;
  fila.eachCell((c, i) => {
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: editables.includes(i) ? 'FF7F6000' : ENCABEZADO },
    };
  });
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
}

/** Libro de decisiones: lo ya decidido se conserva y se agregan los centros nuevos con una propuesta. */
export function construirDecisiones(d: DatosDecisiones): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(HOJA_CENTROS);
  hoja.columns = [
    { header: 'CÓDIGO EN EL EXCEL', key: 'codigoExcel', width: 22 },
    { header: 'DESCRIPCIÓN', key: 'descripcion', width: 46 },
    { header: 'ACCIÓN', key: 'accion', width: 16 },
    { header: 'CÓDIGO EN EL SISTEMA', key: 'codigoSistema', width: 24 },
    { header: 'NOMBRE DE LA OBRA', key: 'nombre', width: 46 },
    { header: 'NOTAS', key: 'notas', width: 60 },
    { header: 'FILAS', key: 'filas', width: 8 },
    {
      header: 'IMPORTE',
      key: 'importe',
      width: 16,
      style: { numFmt: '"S/" #,##0.00' },
    },
    {
      header: 'PRIMER PAGO',
      key: 'primerPago',
      width: 13,
      style: { numFmt: 'dd/mm/yyyy' },
    },
    {
      header: 'ÚLTIMO PAGO',
      key: 'ultimoPago',
      width: 13,
      style: { numFmt: 'dd/mm/yyyy' },
    },
    { header: '¿ACTIVA?', key: 'activa', width: 10 },
    { header: '¿EXISTE EN EL SISTEMA?', key: 'existe', width: 14 },
  ];
  estilarEncabezado(hoja, [3, 4, 5, 6]);

  const resumen = new Map(
    d.centros.map((c) => [claveCodigo(c.codigoExcel), c]),
  );
  const filas = [...d.decisiones].map(([llave, decision]) => ({
    llave,
    decision,
    r: resumen.get(llave),
  }));
  filas.sort(
    (a, b) =>
      (b.r?.filas ?? -1) - (a.r?.filas ?? -1) ||
      a.decision.codigoExcel.localeCompare(b.decision.codigoExcel),
  );
  for (const { decision, r } of filas) {
    const existe =
      decision.accion === 'administracion'
        ? 'n/a'
        : d.existentes
          ? d.existentes.has(claveCodigo(decision.codigoSistema))
            ? 'SI'
            : 'NO'
          : '(sin consultar)';
    const fila = hoja.addRow({
      codigoExcel: decision.codigoExcel,
      descripcion: r?.descripcion ?? decision.nombre,
      accion: decision.accion,
      codigoSistema: decision.codigoSistema,
      nombre: decision.nombre,
      notas: decision.notas,
      filas: r?.filas ?? null,
      importe: r?.importe ?? null,
      primerPago: r?.primerPago ?? null,
      ultimoPago: r?.ultimoPago ?? null,
      activa: r ? (r.ultimoPago >= d.activaDesde ? 'SI' : 'no') : '',
      existe,
    });
    for (const i of [3, 4, 5, 6])
      fila.getCell(i).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: AMARILLO },
      };
    if (r?.propuestaNueva) fila.getCell(1).font = { bold: true };
    fila.getCell(6).alignment = { wrapText: true, vertical: 'top' };
    if (existe === 'NO' && r && r.ultimoPago >= d.activaDesde) {
      fila.getCell(12).font = { bold: true, color: { argb: 'FFC00000' } };
    }
  }
  for (let i = 2; i <= hoja.rowCount; i++) {
    hoja.getCell(i, 3).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"obra,administracion"'],
    };
  }

  const correcciones = libro.addWorksheet(HOJA_CORRECCIONES);
  correcciones.columns = [
    { header: 'COMPROBANTE', key: 'comprobante', width: 18 },
    { header: 'COLUMNA', key: 'columna', width: 34 },
    { header: 'VALOR NUEVO', key: 'valor', width: 24 },
    { header: 'MOTIVO', key: 'motivo', width: 90 },
  ];
  estilarEncabezado(correcciones, [3]);
  const encabezadoDe = (clave: ClaveColumna) =>
    COLUMNAS.find((c) => c.clave === clave)?.encabezado ?? clave;
  const yaEstan = new Set<string>();
  for (const c of d.correcciones) {
    yaEstan.add(`${limpiar(c.comprobante)}|${c.columna}`);
    correcciones.addRow({
      comprobante: c.comprobante,
      columna: encabezadoDe(c.columna),
      valor: c.valor,
      motivo: 'Decidido',
    });
  }
  for (const e of d.excepciones.filter(
    (x) => x.severidad === 'revisar' && x.columna && x.comprobante,
  )) {
    if (yaEstan.has(`${limpiar(e.comprobante)}|${e.columna}`)) continue;
    correcciones.addRow({
      comprobante: e.comprobante,
      columna: encabezadoDe(e.columna!),
      valor: '',
      motivo: `${e.detalle}. ${e.sugerencia}`,
    });
  }
  for (let i = 2; i <= Math.max(correcciones.rowCount, 40); i++) {
    correcciones.getCell(i, 3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: AMARILLO },
    };
    correcciones.getCell(i, 3).numFmt = '@';
  }
  correcciones.getRow(1).getCell(4).note =
    'Las filas sin VALOR NUEVO son sugerencias: se ignoran hasta que escribas el valor.';
  return libro;
}
