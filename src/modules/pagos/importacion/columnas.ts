/**
 * Columnas del Excel de pagos de tesorería. Es la única fuente de verdad: el
 * lector reconoce los encabezados por estos alias, la plantilla los escribe
 * tal cual y el exportador usa el mismo orden. Los encabezados reproducen los
 * del Excel real (incluido el "Nº"/"N°"), pero el lector es tolerante a
 * acentos, mayúsculas, espacios y símbolos.
 */
export type ClaveColumna =
  | 'subComprobante'
  | 'comprobante'
  | 'fecha'
  | 'importe'
  | 'tipoOperacion'
  | 'banco'
  | 'cuenta'
  | 'tipoGasto'
  | 'detalle'
  | 'responsable'
  | 'proveedor'
  | 'cuentaProveedor'
  | 'centroCosto'
  | 'descCentroCosto'
  | 'importeRendido'
  | 'generoComprobante'
  | 'estadoRendicion'
  | 'empresa'
  | 'ruc'
  | 'nota';

export interface ColumnaPago {
  clave: ClaveColumna;
  /** Encabezado tal como lo escribe la plantilla. */
  encabezado: string;
  /** Otras formas aceptadas al leer (el encabezado propio ya cuenta). */
  alias: string[];
  ancho: number;
  tipo: 'texto' | 'fecha' | 'monto';
  ayuda: string;
}

export const COLUMNAS: ColumnaPago[] = [
  {
    clave: 'subComprobante',
    encabezado: 'N° DE SUB COMPROBANTE',
    alias: [
      'NRO DE SUB COMPROBANTE',
      'SUB COMPROBANTE',
      'NUMERO SUB COMPROBANTE',
    ],
    ancho: 18,
    tipo: 'texto',
    ayuda:
      'Comprobante + línea, separados por coma: 262248,1. Si una transferencia se reparte en varias líneas: 262248,1 / 262248,2…',
  },
  {
    clave: 'comprobante',
    encabezado: 'Nº COMPROBANTE',
    alias: [
      'NRO COMPROBANTE',
      'NUMERO COMPROBANTE',
      'N COMPROBANTE',
      'COMPROBANTE',
    ],
    ancho: 14,
    tipo: 'texto',
    ayuda: 'Año (2 dígitos) + correlativo, sin guion: 262248 = 26-2248.',
  },
  {
    clave: 'fecha',
    encabezado: 'FECHA DE OPERACION',
    alias: ['FECHA OPERACION', 'FECHA DE PAGO', 'FECHA'],
    ancho: 16,
    tipo: 'fecha',
    ayuda: 'Día en que salió el dinero (dd/mm/aaaa).',
  },
  {
    clave: 'importe',
    encabezado: 'IMPORTE',
    alias: ['MONTO', 'IMPORTE PAGADO'],
    ancho: 14,
    tipo: 'monto',
    ayuda: 'Monto pagado en soles. Acepta S/1.269,00 o 1269.00.',
  },
  {
    clave: 'tipoOperacion',
    encabezado: 'TIPO DE OPERACIÓN',
    alias: ['TIPO OPERACION', 'OPERACION', 'METODO DE PAGO'],
    ancho: 18,
    tipo: 'texto',
    ayuda: 'TRANSFERENCIA, EFECTIVO, YAPE, PLIN, CHEQUE…',
  },
  {
    clave: 'banco',
    encabezado: 'BANCO',
    alias: ['BANCO ORIGEN', 'CUENTA DE CARGO'],
    ancho: 34,
    tipo: 'texto',
    ayuda:
      'Cuenta de la empresa de la que SALE el dinero, como la rotula tesorería: BCP-D&C INGENIERIA Y PROYECTOS.',
  },
  {
    clave: 'cuenta',
    encabezado: 'CUENTA',
    alias: ['NUMERO DE CUENTA', 'CUENTA ORIGEN', 'N CUENTA'],
    ancho: 20,
    tipo: 'texto',
    ayuda: 'Número de la cuenta de origen: 305-98401930-95.',
  },
  {
    clave: 'tipoGasto',
    encabezado: 'TIPO DE GASTO',
    alias: ['TIPO GASTO', 'CATEGORIA', 'RUBRO'],
    ancho: 30,
    tipo: 'texto',
    ayuda:
      'VIATICOS, FLETES DE TRANSPORTE, COMPRA DE MATERIALES Y CONSUMIBLES… (lista en la hoja Listas).',
  },
  {
    clave: 'detalle',
    encabezado: 'DETALLE DEL GASTO',
    alias: ['DETALLE GASTO', 'DETALLE', 'CONCEPTO', 'DESCRIPCION DEL GASTO'],
    ancho: 50,
    tipo: 'texto',
    ayuda: 'En qué se gastó.',
  },
  {
    clave: 'responsable',
    encabezado: 'RESPONSABLE DE LA RENDICION',
    alias: [
      'RESPONSABLE RENDICION',
      'RESPONSABLE DE LA RENDICIÓN',
      'RESPONSABLE',
    ],
    ancho: 32,
    tipo: 'texto',
    ayuda:
      'Quien debe sustentar el gasto. ADMINISTRACION si no es una persona concreta.',
  },
  {
    clave: 'proveedor',
    encabezado: 'PROVEEDOR',
    alias: ['BENEFICIARIO'],
    ancho: 34,
    tipo: 'texto',
    ayuda:
      'A quién se pagó. NO APLICA si el dinero fue al responsable de la rendición.',
  },
  {
    clave: 'cuentaProveedor',
    encabezado: 'CUENTA CTE O AHORROS PROVEEDOR',
    alias: [
      'CUENTA PROVEEDOR',
      'CUENTA CTE O AHORROS',
      'CUENTA DEL PROVEEDOR',
      'CUENTA DESTINO',
    ],
    ancho: 26,
    tipo: 'texto',
    ayuda: 'Cuenta del beneficiario. 0 o NO APLICA si no hay.',
  },
  {
    clave: 'centroCosto',
    encabezado: 'CENTRO DE COSTO',
    alias: [
      'CENTRO COSTO',
      'COD CENTRO DE COSTO',
      'CODIGO CENTRO DE COSTO',
      'CODIGO DE OBRA',
      'OBRA',
    ],
    ancho: 16,
    tipo: 'texto',
    ayuda:
      'Código de la obra (Proyecto.codigo): 022-ING-26. Vacío, 0 o ADMINISTRACION para gastos de oficina.',
  },
  {
    clave: 'descCentroCosto',
    encabezado: 'DESCRIPCIÓN DEL CENTRO DE COSTOS',
    alias: [
      'DESCRIPCION DEL CENTRO DE COSTO',
      'DESCRIPCION CENTRO DE COSTOS',
      'DESCRIPCION CENTRO DE COSTO',
      'NOMBRE DE LA OBRA',
    ],
    ancho: 36,
    tipo: 'texto',
    ayuda:
      'Nombre de la obra. Solo se usa para validar el código (y para crear la obra si no existe).',
  },
  {
    clave: 'importeRendido',
    encabezado: 'IMPORTE RENDIDO',
    alias: ['RENDIDO', 'MONTO RENDIDO'],
    ancho: 14,
    tipo: 'monto',
    ayuda: 'Cuánto del importe ya se sustentó con comprobantes.',
  },
  {
    clave: 'generoComprobante',
    encabezado: 'GENERÓ EL COMPROBANTE',
    alias: ['GENERO COMPROBANTE', 'GENERADO POR', 'ELABORADO POR'],
    ancho: 28,
    tipo: 'texto',
    ayuda: 'Persona de tesorería que generó la constancia.',
  },
  {
    clave: 'estadoRendicion',
    encabezado: 'ABIERTO / CERRADO',
    alias: [
      'ABIERTO/CERRADO',
      'ESTADO DE LA RENDICION',
      'ESTADO RENDICION',
      'ESTADO',
    ],
    ancho: 14,
    tipo: 'texto',
    ayuda: 'ABIERTO si falta sustentar, CERRADO si la rendición está completa.',
  },
  {
    clave: 'empresa',
    encabezado: 'EMPRESA',
    alias: ['RAZON SOCIAL', 'RAZON SOCIAL EMPRESA'],
    ancho: 34,
    tipo: 'texto',
    ayuda: 'Razón social que paga.',
  },
  {
    clave: 'ruc',
    encabezado: 'RUC EMPRESA',
    alias: ['RUC'],
    ancho: 14,
    tipo: 'texto',
    ayuda: 'RUC de la empresa que paga (11 dígitos). Vacío = D&C.',
  },
  {
    clave: 'nota',
    encabezado: 'OBSERVACIÓN',
    alias: ['NOTA', 'OBSERVACION', 'COMENTARIO', 'COMENTARIOS'],
    ancho: 40,
    tipo: 'texto',
    ayuda:
      'Opcional. Se guarda como observación del pago (sale en la constancia).',
  },
];

export const CLAVES_REQUERIDAS: ClaveColumna[] = [
  'fecha',
  'importe',
  'centroCosto',
];

export const EMPRESA_POR_DEFECTO_RUC = '20608745611';

/** Quita acentos y símbolos para comparar encabezados: "Nº COMPROBANTE" → "NCOMPROBANTE". */
export function compactar(valor: unknown): string {
  return (
    typeof valor === 'string' || typeof valor === 'number' ? String(valor) : ''
  )
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const POR_ENCABEZADO = new Map<string, ClaveColumna>();
for (const col of COLUMNAS) {
  for (const nombre of [col.encabezado, ...col.alias]) {
    POR_ENCABEZADO.set(compactar(nombre), col.clave);
  }
}

export function claveDeEncabezado(encabezado: unknown): ClaveColumna | null {
  return POR_ENCABEZADO.get(compactar(encabezado)) ?? null;
}
