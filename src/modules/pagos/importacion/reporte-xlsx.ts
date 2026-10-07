import ExcelJS from 'exceljs';
import type {
  AccionFila,
  FilaPlan,
  PlanImportacion,
} from './importacion.service.js';

const ETIQUETA_ACCION: Record<AccionFila, string> = {
  crear: 'NUEVO',
  omitir: 'YA EXISTE',
  vincular: 'ENLAZAR',
  revisar: 'REVISAR',
  error: 'ERROR',
};

const COLOR_ACCION: Record<AccionFila, string> = {
  crear: 'FFE6F4EA',
  omitir: 'FFF1F3F4',
  vincular: 'FFE8F0FE',
  revisar: 'FFFEF7E0',
  error: 'FFFCE8E6',
};

const PREFIJO_NIVEL = { error: 'ERROR', aviso: 'AVISO', info: 'INFO' } as const;

const soles = (n: number) =>
  n.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function estilarEncabezado(hoja: ExcelJS.Worksheet) {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A3557' },
  };
  fila.alignment = { vertical: 'middle' };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
}

function agregarDetalle(hoja: ExcelJS.Worksheet, filas: FilaPlan[]) {
  hoja.columns = [
    { header: 'Fila en el Excel', key: 'fila', width: 14 },
    { header: 'Comprobante', key: 'comprobante', width: 16 },
    { header: 'Qué pasará', key: 'accion', width: 14 },
    {
      header: 'Fecha',
      key: 'fecha',
      width: 12,
      style: { numFmt: 'dd/mm/yyyy' },
    },
    {
      header: 'Importe',
      key: 'monto',
      width: 14,
      style: { numFmt: '"S/" #,##0.00' },
    },
    { header: 'Observaciones', key: 'mensajes', width: 110 },
  ];
  estilarEncabezado(hoja);
  for (const f of filas) {
    const fila = hoja.addRow({
      fila: f.fila,
      comprobante: f.comprobante ?? '',
      accion: ETIQUETA_ACCION[f.accion],
      fecha: f.datos?.fecha ?? null,
      monto: f.datos?.monto ?? null,
      mensajes: f.mensajes
        .map((m) => `[${PREFIJO_NIVEL[m.nivel]}] ${m.texto}`)
        .join('\n'),
    });
    fila.getCell('accion').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_ACCION[f.accion] },
    };
    fila.getCell('mensajes').alignment = { wrapText: true, vertical: 'top' };
    fila.alignment = { vertical: 'top' };
  }
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
}

function agregarLista(
  hoja: ExcelJS.Worksheet,
  columnas: { header: string; key: string; width: number }[],
  filas: object[],
) {
  hoja.columns = columnas;
  estilarEncabezado(hoja);
  for (const fila of filas) hoja.addRow(fila);
}

/** Reporte de una simulación (o de una carga ya hecha) para revisarlo en Excel. */
export function construirReporte(plan: PlanImportacion): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  const r = plan.resumen;

  const resumen = libro.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Concepto', key: 'concepto', width: 52 },
    { header: 'Valor', key: 'valor', width: 22 },
  ];
  estilarEncabezado(resumen);
  const lineas: [string, string | number][] = [
    ['Archivo', plan.archivo],
    ['Filas leídas', r.total + plan.fueraDeRango],
    ['  Fuera del rango de fechas pedido (se ignoran)', plan.fueraDeRango],
    ['  Dentro del rango', r.total],
    ['NUEVOS: se cargarán', r.crear],
    ['  Importe total de los nuevos (S/)', soles(r.montoCrear)],
    ['YA EXISTEN: mismo comprobante en el sistema (se omiten)', r.omitir],
    ['ENLAZAR: coinciden con un pago ya registrado sin código', r.vincular],
    ['REVISAR: duplicado dudoso o importe distinto (no se cargan)', r.revisar],
    ['ERRORES: hay que corregir el Excel (no se cargan)', r.error],
    ['', ''],
    [
      'Obras (centros de costo) que no existen en el sistema',
      plan.proyectosFaltantes.length,
    ],
    ['Tipos de gasto nuevos', plan.categoriasNuevas.length],
    ['Empresas nuevas', plan.empresasNuevas.length],
    ['Cuentas de origen nuevas', plan.cuentasNuevas.length],
    [
      'Personas que no se pudieron vincular a un trabajador/usuario',
      plan.personasSinVincular.length,
    ],
  ];
  for (const [concepto, valor] of lineas) resumen.addRow({ concepto, valor });

  agregarDetalle(libro.addWorksheet('Detalle'), plan.filas);
  agregarDetalle(
    libro.addWorksheet('Para corregir'),
    plan.filas.filter((f) => f.accion === 'error' || f.accion === 'revisar'),
  );

  if (plan.proyectosFaltantes.length) {
    agregarLista(
      libro.addWorksheet('Obras faltantes'),
      [
        { header: 'Centro de costo (código)', key: 'codigo', width: 24 },
        { header: 'Descripción en el Excel', key: 'descripcion', width: 50 },
        { header: 'Filas', key: 'filas', width: 10 },
        { header: 'Importe total (S/)', key: 'monto', width: 20 },
      ],
      plan.proyectosFaltantes,
    );
  }
  if (plan.categoriasNuevas.length) {
    agregarLista(
      libro.addWorksheet('Tipos de gasto nuevos'),
      [{ header: 'Tipo de gasto', key: 'nombre', width: 50 }],
      plan.categoriasNuevas.map((nombre) => ({ nombre })),
    );
  }
  if (plan.empresasNuevas.length || plan.cuentasNuevas.length) {
    agregarLista(
      libro.addWorksheet('Empresas y cuentas nuevas'),
      [
        { header: 'RUC', key: 'ruc', width: 16 },
        { header: 'Razón social / banco', key: 'nombre', width: 44 },
        { header: 'N° de cuenta', key: 'numero', width: 24 },
      ],
      [
        ...plan.empresasNuevas.map((e) => ({
          ruc: e.ruc,
          nombre: e.razonSocial,
          numero: '(empresa)',
        })),
        ...plan.cuentasNuevas.map((c) => ({
          ruc: c.ruc,
          nombre: c.banco,
          numero: c.numero,
        })),
      ],
    );
  }
  if (plan.personasSinVincular.length) {
    agregarLista(
      libro.addWorksheet('Personas sin vincular'),
      [
        { header: 'Nombre en el Excel', key: 'nombre', width: 40 },
        { header: 'Como', key: 'rol', width: 46 },
        { header: 'Filas', key: 'filas', width: 10 },
      ],
      plan.personasSinVincular,
    );
  }
  return libro;
}
