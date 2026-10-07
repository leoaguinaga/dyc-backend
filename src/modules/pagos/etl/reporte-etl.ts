import ExcelJS from 'exceljs';
import { COLUMNAS } from '../importacion/columnas.js';
import type { FilaLimpia, ResultadoLimpieza } from './limpiador.js';

const FORMATO_MONTO = '"S/" #,##0.00';

function encabezado(hoja: ExcelJS.Worksheet) {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.alignment = { vertical: 'middle', wrapText: true };
  fila.eachCell(
    (c) =>
      (c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A3557' },
      }),
  );
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * La fuente limpia: una hoja "Pagos" con las columnas del Excel de tesorería, lista
 * para `pnpm pagos:importar`. El comprobante va en formato del sistema (26-0001) y la
 * última columna apunta a la fila del Excel original para poder volver a ella.
 */
export function construirLimpio(filas: FilaLimpia[]): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Pagos');
  hoja.columns = [
    ...COLUMNAS.map((c) => ({
      header: c.encabezado,
      key: c.clave,
      width: c.ancho,
      style: {
        numFmt:
          c.tipo === 'fecha'
            ? 'dd/mm/yyyy'
            : c.tipo === 'monto'
              ? FORMATO_MONTO
              : '@',
      },
    })),
    { header: 'FILA EN EL EXCEL ORIGINAL', key: 'filaOrigen', width: 14 },
  ];
  encabezado(hoja);
  for (const f of filas) {
    hoja.addRow({
      subComprobante: `${f.codigo},${f.subNumero}`,
      comprobante: f.codigo,
      fecha: f.fecha,
      importe: f.importe,
      tipoOperacion: f.tipoOperacion,
      banco: f.banco,
      cuenta: f.cuenta,
      tipoGasto: f.tipoGasto,
      detalle: f.detalle,
      responsable: f.responsable,
      proveedor: f.proveedor,
      cuentaProveedor: f.cuentaProveedor,
      centroCosto: f.centroCosto,
      descCentroCosto: f.descCentroCosto,
      importeRendido: f.importeRendido,
      generoComprobante: f.generoComprobante,
      estadoRendicion: f.estadoRendicion,
      empresa: f.empresa,
      ruc: f.ruc,
      nota: f.nota,
      filaOrigen: f.filaOrigen,
    });
  }
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNAS.length + 1 },
  };
  return libro;
}

const REGLAS: Record<string, string> = {
  'fecha-texto': 'Fecha escrita como texto → fecha real',
  'responsable-catalogo':
    'Responsable corregido al del catálogo (error de escritura)',
  'responsable-orden':
    'Responsable con las palabras en otro orden → el del catálogo',
  'proveedor-catalogo': 'Proveedor corregido al del catálogo',
  'cuenta-catalogo': 'Cuenta del proveedor tomada del catálogo (texto)',
  'descripcion-centro':
    'Descripción del centro de costo completada desde el catálogo',
  'sub-renumerado':
    'Línea repetida del comprobante renumerada (otra línea de la misma transferencia)',
  'correccion-manual': 'Corrección decidida por ti (hoja Correcciones)',
};

export interface MetaReporte {
  archivo: string;
  hoja: string;
  rango: string;
}

/** Reporte del ETL: qué se leyó, qué se cambió, qué se excluyó y qué requiere una decisión. */
export function construirReporteEtl(
  r: ResultadoLimpieza,
  meta: MetaReporte,
): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();

  const resumen = libro.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Concepto', key: 'concepto', width: 66 },
    { header: 'Valor', key: 'valor', width: 22 },
    {
      header: 'Importe (S/)',
      key: 'importe',
      width: 20,
      style: { numFmt: FORMATO_MONTO },
    },
  ];
  encabezado(resumen);
  const linea = (
    concepto: string,
    valor: string | number = '',
    importe?: number,
  ) => resumen.addRow({ concepto, valor, importe: importe ?? null });
  const titulo = (texto: string) => {
    const f = resumen.addRow({ concepto: texto });
    f.font = { bold: true };
  };
  const c = r.conteos;
  linea('Archivo', meta.archivo);
  linea('Hoja leída', meta.hoja);
  linea('Rango pedido', meta.rango);
  linea('');
  titulo('LO QUE SE LEYÓ');
  linea('Filas leídas', c.leidas);
  linea('  Fuera del rango pedido', c.fueraDeRango);
  titulo('FUENTE LIMPIA (lo que va al sistema)');
  linea('Filas limpias', r.control.filas, r.control.importe);
  titulo('EXCLUIDAS (no van a la fuente limpia)');
  const porMotivo = new Map<string, number>();
  for (const e of r.exclusiones)
    porMotivo.set(e.motivo, (porMotivo.get(e.motivo) ?? 0) + 1);
  if (!porMotivo.size) linea('  (ninguna)');
  for (const [motivo, n] of porMotivo) linea(`  ${motivo}`, n);
  titulo('CAMBIOS AUTOMÁTICOS (hoja Cambios)');
  for (const [regla, n] of Object.entries(c.cambiosPorRegla))
    linea(`  ${REGLAS[regla] ?? regla}`, n);
  linea('  Celdas con espacios sobrantes normalizadas', c.celdasConEspacios);
  titulo('PARA REVISAR (hoja Excepciones)');
  const porTipo = new Map<string, { n: number; sev: string }>();
  for (const e of r.excepciones)
    porTipo.set(e.tipo, {
      n: (porTipo.get(e.tipo)?.n ?? 0) + 1,
      sev: e.severidad,
    });
  if (!porTipo.size) linea('  (ninguna)');
  for (const [tipo, { n, sev }] of porTipo) linea(`  ${tipo} [${sev}]`, n);
  linea(
    '  Filas sin proveedor ni responsable (se cargan sin beneficiario)',
    c.sinBeneficiario,
  );
  linea('');
  titulo('CONTROL POR MES (para conciliar contra el sistema)');
  for (const m of r.control.porMes) linea(`  ${m.mes}`, m.filas, m.importe);
  linea('');
  titulo('CONTROL POR TIPO DE GASTO');
  for (const t of [...r.control.porTipoGasto].sort(
    (a, b) => b.importe - a.importe,
  ))
    linea(`  ${t.tipoGasto}`, t.filas, t.importe);

  const hojaCambios = libro.addWorksheet('Cambios');
  hojaCambios.columns = [
    { header: 'Fila en el Excel', key: 'fila', width: 12 },
    { header: 'Comprobante', key: 'comprobante', width: 16 },
    { header: 'Columna', key: 'columna', width: 34 },
    { header: 'Valor original', key: 'original', width: 44 },
    { header: 'Valor nuevo', key: 'nuevo', width: 44 },
    { header: 'Regla', key: 'regla', width: 24 },
  ];
  encabezado(hojaCambios);
  for (const x of r.cambios) hojaCambios.addRow(x);
  hojaCambios.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 6 },
  };

  const hojaExcepciones = libro.addWorksheet('Excepciones');
  hojaExcepciones.columns = [
    { header: 'Fila en el Excel', key: 'fila', width: 12 },
    { header: 'Comprobante', key: 'comprobante', width: 16 },
    { header: 'Tipo', key: 'tipo', width: 30 },
    { header: 'Severidad', key: 'severidad', width: 11 },
    { header: 'Detalle', key: 'detalle', width: 80 },
    { header: 'Qué hacer', key: 'sugerencia', width: 80 },
  ];
  encabezado(hojaExcepciones);
  const orden = [...r.excepciones].sort(
    (a, b) =>
      Number(b.severidad === 'revisar') - Number(a.severidad === 'revisar') ||
      a.tipo.localeCompare(b.tipo) ||
      a.fila - b.fila,
  );
  for (const x of orden) {
    const fila = hojaExcepciones.addRow(x);
    if (x.severidad === 'revisar')
      fila.getCell(4).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFCE8E6' },
      };
  }
  hojaExcepciones.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 6 },
  };

  const hojaExcluidas = libro.addWorksheet('Excluidas');
  hojaExcluidas.columns = [
    { header: 'Fila en el Excel', key: 'fila', width: 12 },
    { header: 'Comprobante', key: 'comprobante', width: 16 },
    { header: 'Motivo', key: 'motivo', width: 22 },
    { header: 'Detalle', key: 'detalle', width: 90 },
  ];
  encabezado(hojaExcluidas);
  for (const x of r.exclusiones) hojaExcluidas.addRow(x);

  return libro;
}
