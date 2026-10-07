import ExcelJS from 'exceljs';
import { COLUMNAS, EMPRESA_POR_DEFECTO_RUC } from './columnas.js';
import type { ColumnaPago } from './columnas.js';

export interface ListasPlantilla {
  tiposOperacion: string[];
  tiposGasto: string[];
  centrosCosto: { codigo: string; nombre: string }[];
  empresas: { ruc: string; razonSocial: string }[];
  cuentas: { banco: string; numero: string }[];
}

export const TIPOS_OPERACION_BASE = [
  'TRANSFERENCIA',
  'EFECTIVO',
  'YAPE',
  'PLIN',
  'CHEQUE',
];

/** Tipos de gasto que aparecen en el Excel de tesorería; se completan con los que ya tenga el sistema. */
export const TIPOS_GASTO_BASE = [
  'VIATICOS',
  'FLETES DE TRANSPORTE',
  'COMPRA DE MATERIALES Y CONSUMIBLES',
  'POLIZAS',
  'OTROS GASTOS DIVERSOS',
];

const FILAS_CON_VALIDACION = 2000;
const FORMATO_MONTO = '"S/" #,##0.00';
const FORMATO_FECHA = 'dd/mm/yyyy';

const EJEMPLOS: Record<string, unknown>[] = [
  {
    subComprobante: '269901,1',
    comprobante: '269901',
    fecha: new Date(Date.UTC(2026, 8, 25)),
    importe: 180,
    tipoOperacion: 'TRANSFERENCIA',
    banco: 'BCP-D&C INGENIERIA Y PROYECTOS',
    cuenta: '305-00000000-00',
    tipoGasto: 'VIATICOS',
    detalle: 'HOSPEDAJE DEL 25 AL 28/09',
    responsable: 'APELLIDO NOMBRE (EJEMPLO)',
    proveedor: 'NO APLICA',
    cuentaProveedor: '0',
    centroCosto: '000-ING-26',
    descCentroCosto: 'OBRA DE EJEMPLO',
    importeRendido: 180,
    generoComprobante: 'PERSONA DE TESORERIA (EJEMPLO)',
    estadoRendicion: 'CERRADO',
    empresa: 'D&C INGENIERIA Y PROYECTOS SAC',
    ruc: EMPRESA_POR_DEFECTO_RUC,
  },
  {
    subComprobante: '269902,1',
    comprobante: '269902',
    fecha: new Date(Date.UTC(2026, 8, 26)),
    importe: 1269,
    tipoOperacion: 'TRANSFERENCIA',
    banco: 'BCP-D&C INGENIERIA Y PROYECTOS',
    cuenta: '305-00000000-00',
    tipoGasto: 'COMPRA DE MATERIALES Y CONSUMIBLES',
    detalle: 'COMPRA DE TUBERIA PVC MAS MOVILIDAD',
    responsable: 'ADMINISTRACION',
    proveedor: 'FERRETERIA EJEMPLO SAC',
    cuentaProveedor: '19100000000000',
    centroCosto: '000-ING-26',
    descCentroCosto: 'OBRA DE EJEMPLO',
    importeRendido: 1269,
    generoComprobante: 'PERSONA DE TESORERIA (EJEMPLO)',
    estadoRendicion: 'CERRADO',
    empresa: 'D&C INGENIERIA Y PROYECTOS SAC',
    ruc: EMPRESA_POR_DEFECTO_RUC,
  },
  {
    subComprobante: '269903,1',
    comprobante: '269903',
    fecha: new Date(Date.UTC(2026, 8, 26)),
    importe: 500,
    tipoOperacion: 'TRANSFERENCIA',
    banco: 'BCP-D&C INGENIERIA Y PROYECTOS',
    cuenta: '305-00000000-00',
    tipoGasto: 'OTROS GASTOS DIVERSOS',
    detalle:
      'ADELANTO PARA COMPRAS MENORES (UNA TRANSFERENCIA REPARTIDA EN 2 LINEAS)',
    responsable: 'APELLIDO NOMBRE (EJEMPLO)',
    proveedor: 'NO APLICA',
    cuentaProveedor: '0',
    centroCosto: '000-ING-26',
    descCentroCosto: 'OBRA DE EJEMPLO',
    importeRendido: '',
    generoComprobante: 'PERSONA DE TESORERIA (EJEMPLO)',
    estadoRendicion: 'ABIERTO',
    empresa: 'D&C INGENIERIA Y PROYECTOS SAC',
    ruc: EMPRESA_POR_DEFECTO_RUC,
  },
];

function formatoColumna(col: ColumnaPago) {
  if (col.tipo === 'fecha') return FORMATO_FECHA;
  if (col.tipo === 'monto') return FORMATO_MONTO;
  return '@'; // texto: evita que Excel convierta 262248,1 en un número
}

function crearHojaPagos(libro: ExcelJS.Workbook, nombre: string) {
  const hoja = libro.addWorksheet(nombre);
  hoja.columns = COLUMNAS.map((col) => ({
    header: col.encabezado,
    key: col.clave,
    width: col.ancho,
    style: { numFmt: formatoColumna(col) },
  }));
  const encabezado = hoja.getRow(1);
  encabezado.height = 32;
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  encabezado.alignment = { vertical: 'middle', wrapText: true };
  encabezado.eachCell((celda, columna) => {
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A3557' },
    };
    celda.note = COLUMNAS[columna - 1].ayuda;
  });
  hoja.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
  return hoja;
}

function columnaDe(clave: ColumnaPago['clave']) {
  return COLUMNAS.findIndex((c) => c.clave === clave) + 1;
}

/** Plantilla para que tesorería anote pagos: mismas columnas que su Excel, con listas desplegables. */
export function construirPlantilla(listas: ListasPlantilla): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'D&C ERP';

  const hoja = crearHojaPagos(libro, 'Pagos');
  const hojaListas = libro.addWorksheet('Listas');
  const columnasListas: { titulo: string; valores: string[]; ancho: number }[] =
    [
      {
        titulo: 'Tipo de operación',
        valores: listas.tiposOperacion,
        ancho: 22,
      },
      { titulo: 'Tipo de gasto', valores: listas.tiposGasto, ancho: 40 },
      {
        titulo: 'Abierto / Cerrado',
        valores: ['ABIERTO', 'CERRADO'],
        ancho: 18,
      },
      {
        titulo: 'Centro de costo (código)',
        valores: listas.centrosCosto.map((c) => c.codigo),
        ancho: 24,
      },
      {
        titulo: 'Nombre de la obra',
        valores: listas.centrosCosto.map((c) => c.nombre),
        ancho: 44,
      },
      {
        titulo: 'Cuenta de origen (banco)',
        valores: listas.cuentas.map((c) => c.banco),
        ancho: 38,
      },
      {
        titulo: 'Cuenta de origen (número)',
        valores: listas.cuentas.map((c) => c.numero),
        ancho: 24,
      },
      {
        titulo: 'Empresa',
        valores: listas.empresas.map((e) => e.razonSocial),
        ancho: 44,
      },
      {
        titulo: 'RUC empresa',
        valores: listas.empresas.map((e) => e.ruc),
        ancho: 16,
      },
    ];
  columnasListas.forEach((lista, i) => {
    hojaListas.getColumn(i + 1).width = lista.ancho;
    const encabezado = hojaListas.getCell(1, i + 1);
    encabezado.value = lista.titulo;
    encabezado.font = { bold: true };
    lista.valores.forEach(
      (valor, j) => (hojaListas.getCell(j + 2, i + 1).value = valor),
    );
  });

  const letra = (indice: number) => String.fromCharCode(64 + indice);
  const rango = (indiceLista: number) =>
    `Listas!$${letra(indiceLista)}$2:$${letra(indiceLista)}$${Math.max(columnasListas[indiceLista - 1].valores.length + 1, 2)}`;
  const validaciones: [ColumnaPago['clave'], number][] = [
    ['tipoOperacion', 1],
    ['tipoGasto', 2],
    ['estadoRendicion', 3],
    ['centroCosto', 4],
  ];
  for (let fila = 2; fila <= FILAS_CON_VALIDACION; fila++) {
    for (const [clave, lista] of validaciones) {
      if (!columnasListas[lista - 1].valores.length) continue; // lista vacía: no hay contra qué validar
      // Sin bloquear: la hoja de Listas puede no tener todos los valores, el importador valida igual.
      hoja.getCell(fila, columnaDe(clave)).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [rango(lista)],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Valor fuera de la lista',
        error:
          'Ese valor no está en la hoja Listas. Si es correcto, pulsa Sí; el importador lo revisará.',
      };
    }
    hoja.getCell(fila, columnaDe('importe')).numFmt = FORMATO_MONTO;
    hoja.getCell(fila, columnaDe('importeRendido')).numFmt = FORMATO_MONTO;
    hoja.getCell(fila, columnaDe('fecha')).numFmt = FORMATO_FECHA;
  }

  const ejemplo = crearHojaPagos(libro, 'Ejemplo');
  for (const fila of EJEMPLOS) ejemplo.addRow(fila);
  ejemplo.getRow(1).getCell(1).note =
    'Filas inventadas solo para mostrar cómo se llena la hoja "Pagos". No se cargan.';

  const instrucciones = libro.addWorksheet('Instrucciones', {
    properties: { tabColor: { argb: 'FFFEF7E0' } },
  });
  instrucciones.getColumn(1).width = 34;
  instrucciones.getColumn(2).width = 110;
  const lineas: [string, string][] = [
    [
      'QUÉ ES ESTO',
      'Plantilla para cargar pagos al sistema. Usa las mismas columnas que el Excel de tesorería: puedes pegar tus filas tal cual en la hoja "Pagos".',
    ],
    [
      'Una fila = un pago',
      'Cada fila es una línea de gasto con su propio centro de costo, proveedor y tipo de gasto.',
    ],
    [
      'Comprobantes con varias líneas',
      'Si una transferencia se reparte en varias líneas, repite el Nº COMPROBANTE y numera la línea: 262248,1  262248,2  262248,3.',
    ],
    [
      'N° DE SUB COMPROBANTE y Nº COMPROBANTE',
      'Escribe 262248 (año + correlativo, sin guion; el sistema lo guarda como 26-2248). Basta con una de las dos columnas. Son columnas de TEXTO: no les cambies el formato.',
    ],
    ['Fecha', 'dd/mm/aaaa. Es el día en que salió el dinero.'],
    [
      'Importe / Importe rendido',
      'En soles. Se aceptan S/1.269,00 y 1269.00. Solo soles.',
    ],
    [
      'Centro de costo',
      'Debe ser el código de una obra que exista en el sistema (ver hoja Listas). Para gastos de oficina deja vacío, 0 o ADMINISTRACION.',
    ],
    [
      'Proveedor',
      'A quién se pagó. Si el dinero fue al responsable de la rendición, escribe NO APLICA.',
    ],
    [
      'Cuenta del proveedor',
      'Cuenta de destino. Escribe 0 o NO APLICA si no hay.',
    ],
    [
      'Banco y Cuenta',
      'Son de la cuenta de la EMPRESA de la que salió el dinero (no del proveedor).',
    ],
    [
      'Empresa y RUC',
      'Si dejas el RUC vacío se asume D&C Ingeniería y Proyectos SAC.',
    ],
    [
      'Abierto / Cerrado',
      'CERRADO cuando el responsable ya sustentó todo el gasto; ABIERTO si falta.',
    ],
    [
      'Qué NO hace falta',
      'No hay que adjuntar archivos: la carga registra el pago; las fotos y facturas se suben después desde la ficha del pago.',
    ],
    [
      'Cómo se carga',
      'Esta hoja se la entregas a quien administra el sistema. Antes de escribir nada se hace una simulación con un reporte de errores y duplicados.',
    ],
  ];
  instrucciones.addRow(['Tema', 'Instrucción']);
  instrucciones.getRow(1).font = { bold: true };
  for (const [tema, texto] of lineas) {
    const fila = instrucciones.addRow([tema, texto]);
    fila.alignment = { wrapText: true, vertical: 'top' };
    fila.getCell(1).font = { bold: true };
  }

  return libro;
}

export interface PagoExportable {
  codigoComprobante: string | null;
  subNumero: number;
  fecha: Date;
  monto: number;
  metodoPago: string | null;
  cuentaOrigen: { banco: string; numero: string } | null;
  categoria: string | null;
  concepto: string | null;
  responsable: string | null;
  proveedor: string | null;
  cuentaProveedor: string | null;
  centroCosto: { codigo: string; nombre: string } | null;
  importeRendido: number | null;
  generadoPor: string | null;
  estadoRendicion: 'abierto' | 'cerrado' | null;
  empresa: { razonSocial: string; ruc: string } | null;
  nota: string | null;
  estado: string;
  id: string;
}

/** Los pagos que el sistema ya tiene, en el formato del Excel, para compararlos con el control de tesorería. */
export function construirExportacion(
  pagos: PagoExportable[],
): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'D&C ERP';
  const hoja = crearHojaPagos(libro, 'Pagos en el sistema');
  hoja.columns = [
    ...hoja.columns,
    { header: 'ESTADO EN EL SISTEMA', key: 'estadoSistema', width: 20 },
    { header: 'ID EN EL SISTEMA', key: 'idSistema', width: 30 },
  ];
  for (const col of [COLUMNAS.length + 1, COLUMNAS.length + 2]) {
    const celda = hoja.getRow(1).getCell(col);
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5F6368' },
    };
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  }
  for (const p of pagos) {
    const sinGuion = p.codigoComprobante?.replace('-', '') ?? '';
    hoja.addRow({
      subComprobante: sinGuion ? `${sinGuion},${p.subNumero}` : '',
      comprobante: sinGuion,
      fecha: p.fecha,
      importe: p.monto,
      tipoOperacion: p.metodoPago?.toUpperCase() ?? '',
      banco: p.cuentaOrigen?.banco ?? '',
      cuenta: p.cuentaOrigen?.numero ?? '',
      tipoGasto: p.categoria ?? '',
      detalle: p.concepto ?? '',
      responsable: p.responsable ?? '',
      proveedor: p.proveedor ?? 'NO APLICA',
      cuentaProveedor: p.cuentaProveedor ?? '0',
      centroCosto: p.centroCosto?.codigo ?? 'ADMINISTRACION',
      descCentroCosto: p.centroCosto?.nombre ?? 'ADMINISTRACION / OFICINA',
      importeRendido: p.importeRendido,
      generoComprobante: p.generadoPor ?? '',
      estadoRendicion: p.estadoRendicion?.toUpperCase() ?? '',
      empresa: p.empresa?.razonSocial ?? '',
      ruc: p.empresa?.ruc ?? '',
      nota: p.nota ?? '',
      estadoSistema: p.estado.toUpperCase(),
      idSistema: p.id,
    });
  }
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNAS.length + 2 },
  };
  return libro;
}
