import ExcelJS from 'exceljs';
import type { PrismaClient } from '../../../prisma/types.js';
import { compactar } from '../importacion/columnas.js';
import type {
  DatosPago,
  PlanImportacion,
} from '../importacion/importacion.service.js';
import {
  clave,
  claveCodigo,
  limpiar,
  titulo,
} from '../importacion/normalizacion.js';

export interface Diferencia {
  comprobante: string;
  campo: string;
  esperado: string;
  enSistema: string;
  /** El pago lo creó una carga masiva (si no, es un pago ya registrado que se enlazó y no se sobrescribe). */
  creadoPorCarga: boolean;
}

export interface PagoSinFila {
  id: string;
  codigo: string;
  fecha: string;
  monto: number;
  estado: string;
  origen: string;
  concepto: string;
}

export interface ResultadoVerificacion {
  filasArchivo: number;
  /** Filas que no se pudieron normalizar (por ejemplo, la obra aún no existe). */
  filasNoVerificables: { fila: number; comprobante: string; motivo: string }[];
  encontradas: number;
  faltantes: { fila: number; comprobante: string }[];
  diferencias: Diferencia[];
  /** Diferencias solo de pagos creados por una carga: son las que cuentan como fallo. */
  diferenciasDeCarga: number;
  porMes: {
    mes: string;
    filasArchivo: number;
    importeArchivo: number;
    filasSistema: number;
    importeSistema: number;
    diferencia: number;
  }[];
  sinFila: PagoSinFila[];
  correlativo: {
    maximoArchivo: string | null;
    maximoSistema: string | null;
    siguienteSistema: string | null;
  };
  /** Verdadero si todas las filas verificables están y no hay diferencias ni descuadres de importe. */
  exitoso: boolean;
}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const mismoNumero = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 0.005;

interface PagoVerificable {
  id: string;
  codigoComprobante: string | null;
  subNumero: number;
  importacionId: string | null;
  estado: string;
  monto: { toString(): string };
  fechaPagoReal: Date | null;
  metodoPago: string | null;
  categoria: string | null;
  concepto: string | null;
  centroCosto: string;
  proyecto: { codigo: string | null } | null;
  beneficiarioNombre: string | null;
  numeroCuenta: string | null;
  empresa: { ruc: string } | null;
  cuentaOrigen: { numero: string } | null;
  responsableRendicionNombre: string | null;
  importeRendido: { toString(): string } | null;
  estadoRendicion: string | null;
  nota: string | null;
}

/** Compara lo que debería haber (fila de la fuente limpia) con lo que hay en el sistema. */
export function compararPago(
  etiqueta: string,
  d: DatosPago,
  p: PagoVerificable,
): Diferencia[] {
  const creadoPorCarga = p.importacionId !== null;
  const salida: Diferencia[] = [];
  const texto = (
    campo: string,
    esperado: string | null,
    real: string | null,
    normalizar: (v: string) => string = clave,
  ) => {
    if (normalizar(esperado ?? '') !== normalizar(real ?? '')) {
      salida.push({
        comprobante: etiqueta,
        campo,
        esperado: esperado ?? '',
        enSistema: real ?? '',
        creadoPorCarga,
      });
    }
  };
  const numero = (
    campo: string,
    esperado: number | null,
    real: number | null,
  ) => {
    if (!mismoNumero(esperado, real)) {
      salida.push({
        comprobante: etiqueta,
        campo,
        esperado: esperado === null ? '' : String(esperado),
        enSistema: real === null ? '' : String(real),
        creadoPorCarga,
      });
    }
  };

  texto('estado', 'pagado', p.estado);
  numero('importe', d.monto, Number(p.monto.toString()));
  texto('fecha de pago', iso(d.fecha), iso(p.fechaPagoReal), (v) => v);
  texto(
    'tipo de operación',
    d.metodoPago ? titulo(d.metodoPago) : '',
    p.metodoPago ?? '',
  );
  texto('tipo de gasto', d.categoria, p.categoria);
  texto('detalle', d.concepto, p.concepto, (v) => limpiar(v));
  // Obra: el código del sistema, o administración si el pago no tiene obra.
  const obraEsperada =
    d.centroCosto === 'administracion'
      ? 'ADMINISTRACION'
      : (d.proyecto.codigo ?? '');
  const obraReal =
    p.proyecto?.codigo ??
    (p.centroCosto === 'administracion' ? 'ADMINISTRACION' : '');
  texto('centro de costo', obraEsperada, obraReal, claveCodigo);
  texto('beneficiario', d.beneficiarioNombre, p.beneficiarioNombre);
  texto('cuenta del proveedor', d.numeroCuenta, p.numeroCuenta, compactar);
  texto('empresa (RUC)', d.empresaRuc, p.empresa?.ruc ?? '', (v) => v);
  texto(
    'cuenta de origen',
    d.cuentaOrigen?.numero ?? '',
    p.cuentaOrigen?.numero ?? '',
    compactar,
  );
  texto(
    'responsable de la rendición',
    d.responsableNombre,
    p.responsableRendicionNombre,
  );
  numero(
    'importe rendido',
    d.importeRendido,
    p.importeRendido ? Number(p.importeRendido.toString()) : null,
  );
  texto(
    'estado de la rendición',
    d.estadoRendicion ?? '',
    p.estadoRendicion ?? '',
    (v) => v,
  );
  texto('observación', d.nota, p.nota, (v) => limpiar(v));
  return salida;
}

const SELECT_VERIFICABLE = {
  id: true,
  codigoComprobante: true,
  subNumero: true,
  importacionId: true,
  estado: true,
  monto: true,
  fechaPagoReal: true,
  metodoPago: true,
  categoria: true,
  concepto: true,
  centroCosto: true,
  proyecto: { select: { codigo: true } },
  beneficiarioNombre: true,
  numeroCuenta: true,
  empresa: { select: { ruc: true } },
  cuentaOrigen: { select: { numero: true } },
  responsableRendicionNombre: true,
  importeRendido: true,
  estadoRendicion: true,
  nota: true,
} as const;

/**
 * Verifica una carga ya hecha. Recibe el plan que arma el importador sobre la fuente
 * limpia (que trae los datos normalizados de cada fila) y lo confronta con la base:
 * cobertura fila a fila, campo a campo, totales por mes y pagos del sistema sin fila.
 */
export async function verificarCarga(
  prisma: PrismaClient,
  plan: PlanImportacion,
): Promise<ResultadoVerificacion> {
  const filasNoVerificables = plan.filas
    .filter((f) => !f.datos)
    .map((f) => ({
      fila: f.fila,
      comprobante: f.comprobante ?? '',
      motivo:
        f.mensajes.find((m) => m.nivel === 'error')?.texto ??
        'sin datos normalizados',
    }));
  const verificables = plan.filas.filter((f) => f.datos);

  const codigos = [
    ...new Set(verificables.map((f) => f.datos!.codigoComprobante)),
  ];
  const pagos: PagoVerificable[] = codigos.length
    ? await prisma.pago.findMany({
        where: { codigoComprobante: { in: codigos } },
        select: SELECT_VERIFICABLE,
      })
    : [];
  const porEtiqueta = new Map(
    pagos.map((p) => [`${p.codigoComprobante}.${p.subNumero}`, p]),
  );

  const faltantes: ResultadoVerificacion['faltantes'] = [];
  const diferencias: Diferencia[] = [];
  const meses = new Map<
    string,
    {
      filasArchivo: number;
      importeArchivo: number;
      filasSistema: number;
      importeSistema: number;
    }
  >();
  const mes = (d: Date) => iso(d).slice(0, 7);
  let encontradas = 0;
  for (const f of verificables) {
    const d = f.datos!;
    const etiqueta = `${d.codigoComprobante}.${d.subNumero}`;
    const m = meses.get(mes(d.fecha)) ?? {
      filasArchivo: 0,
      importeArchivo: 0,
      filasSistema: 0,
      importeSistema: 0,
    };
    m.filasArchivo++;
    m.importeArchivo = redondear2(m.importeArchivo + d.monto);
    const pago = porEtiqueta.get(etiqueta);
    if (!pago) {
      faltantes.push({ fila: f.fila, comprobante: etiqueta });
    } else {
      encontradas++;
      diferencias.push(...compararPago(etiqueta, d, pago));
      // El sistema se suma por la fecha esperada para que un cambio de mes aparezca como descuadre.
      m.filasSistema++;
      m.importeSistema = redondear2(
        m.importeSistema + Number(pago.monto.toString()),
      );
    }
    meses.set(mes(d.fecha), m);
  }

  // Pagos del sistema dentro del período de la fuente que no corresponden a ninguna fila.
  let sinFila: PagoSinFila[] = [];
  if (verificables.length) {
    const fechas = verificables.map((f) => f.datos!.fecha.getTime());
    const rango = {
      gte: new Date(Math.min(...fechas)),
      lte: new Date(Math.max(...fechas)),
    };
    const enArchivo = new Set(codigos);
    const candidatos = await prisma.pago.findMany({
      where: {
        estado: { in: ['pagado', 'pendiente'] },
        OR: [
          { fechaPagoReal: rango },
          { fechaPagoReal: null, fechaProgramada: rango },
        ],
      },
      select: {
        id: true,
        codigoComprobante: true,
        fechaPagoReal: true,
        fechaProgramada: true,
        monto: true,
        estado: true,
        origen: true,
        concepto: true,
      },
    });
    sinFila = candidatos
      .filter(
        (p) => !p.codigoComprobante || !enArchivo.has(p.codigoComprobante),
      )
      .map((p) => ({
        id: p.id,
        codigo: p.codigoComprobante ?? '',
        fecha: iso(p.fechaPagoReal ?? p.fechaProgramada),
        monto: Number(p.monto.toString()),
        estado: p.estado,
        origen: p.origen,
        concepto: p.concepto ?? '',
      }));
  }

  // Correlativo del año de la fuente.
  const anio = verificables[0]?.datos!.codigoComprobante.slice(0, 2) ?? null;
  const maximo = (lista: string[]) =>
    lista.length
      ? lista.reduce((a, b) =>
          Number(a.slice(3)) >= Number(b.slice(3)) ? a : b,
        )
      : null;
  const enSistema = anio
    ? (
        await prisma.pago.findMany({
          where: { codigoComprobante: { startsWith: `${anio}-` } },
          select: { codigoComprobante: true },
        })
      ).map((p) => p.codigoComprobante!)
    : [];
  const maximoSistema = maximo(enSistema);
  const siguiente = maximoSistema
    ? `${anio}-${String(Number(maximoSistema.slice(3)) + 1).padStart(4, '0')}`
    : null;

  const porMes = [...meses]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, v]) => ({
      mes: m,
      ...v,
      diferencia: redondear2(v.importeSistema - v.importeArchivo),
    }));
  const diferenciasDeCarga = diferencias.filter((x) => x.creadoPorCarga).length;
  const exitoso =
    faltantes.length === 0 &&
    diferenciasDeCarga === 0 &&
    porMes.every(
      (m) => m.diferencia === 0 && m.filasArchivo === m.filasSistema,
    );

  return {
    filasArchivo: plan.filas.length,
    filasNoVerificables,
    encontradas,
    faltantes,
    diferencias,
    diferenciasDeCarga,
    porMes,
    sinFila,
    correlativo: {
      maximoArchivo: maximo(
        verificables.map((f) => f.datos!.codigoComprobante),
      ),
      maximoSistema,
      siguienteSistema: siguiente,
    },
    exitoso,
  };
}

export function construirVerificacion(
  r: ResultadoVerificacion,
  archivo: string,
): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  const encabezado = (hoja: ExcelJS.Worksheet) => {
    const fila = hoja.getRow(1);
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    fila.eachCell(
      (c) =>
        (c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1A3557' },
        }),
    );
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const resumen = libro.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Control', key: 'control', width: 70 },
    { header: 'Resultado', key: 'resultado', width: 26 },
  ];
  encabezado(resumen);
  const lineas: [string, string | number][] = [
    ['Archivo verificado', archivo],
    ['Filas en la fuente limpia', r.filasArchivo],
    [
      '  No verificables (no se pudieron normalizar)',
      r.filasNoVerificables.length,
    ],
    ['Filas encontradas en el sistema', r.encontradas],
    ['Filas que FALTAN en el sistema', r.faltantes.length],
    [
      'Diferencias de campos en pagos creados por la carga',
      r.diferenciasDeCarga,
    ],
    [
      'Diferencias en pagos ya existentes que se enlazaron (se conservó lo del sistema)',
      r.diferencias.length - r.diferenciasDeCarga,
    ],
    [
      'Meses que no cuadran (filas o importe)',
      r.porMes.filter(
        (m) => m.diferencia !== 0 || m.filasArchivo !== m.filasSistema,
      ).length,
    ],
    ['Pagos del sistema en el período sin fila en el Excel', r.sinFila.length],
    ['Mayor comprobante en el archivo', r.correlativo.maximoArchivo ?? '—'],
    ['Mayor comprobante en el sistema', r.correlativo.maximoSistema ?? '—'],
    [
      'Próximo comprobante que asignará el sistema',
      r.correlativo.siguienteSistema ?? '—',
    ],
    ['RESULTADO', r.exitoso ? 'CORRECTO' : 'HAY DIFERENCIAS'],
  ];
  for (const [control, resultado] of lineas)
    resumen.addRow({ control, resultado });
  resumen.lastRow!.font = { bold: true };

  const mes = libro.addWorksheet('Control por mes');
  mes.columns = [
    { header: 'Mes', key: 'mes', width: 12 },
    { header: 'Filas (archivo)', key: 'filasArchivo', width: 16 },
    {
      header: 'Importe (archivo)',
      key: 'importeArchivo',
      width: 20,
      style: { numFmt: '"S/" #,##0.00' },
    },
    { header: 'Filas (sistema)', key: 'filasSistema', width: 16 },
    {
      header: 'Importe (sistema)',
      key: 'importeSistema',
      width: 20,
      style: { numFmt: '"S/" #,##0.00' },
    },
    {
      header: 'Diferencia',
      key: 'diferencia',
      width: 16,
      style: { numFmt: '"S/" #,##0.00' },
    },
  ];
  encabezado(mes);
  r.porMes.forEach((m) => mes.addRow(m));

  const dif = libro.addWorksheet('Diferencias');
  dif.columns = [
    { header: 'Comprobante', key: 'comprobante', width: 16 },
    { header: 'Campo', key: 'campo', width: 28 },
    { header: 'Esperado (fuente limpia)', key: 'esperado', width: 46 },
    { header: 'En el sistema', key: 'enSistema', width: 46 },
    { header: 'Origen del pago', key: 'origen', width: 28 },
  ];
  encabezado(dif);
  for (const d of r.diferencias)
    dif.addRow({
      ...d,
      origen: d.creadoPorCarga
        ? 'creado por la carga'
        : 'ya existía (enlazado)',
    });

  const falt = libro.addWorksheet('Faltantes');
  falt.columns = [
    { header: 'Fila en la fuente', key: 'fila', width: 16 },
    { header: 'Comprobante', key: 'comprobante', width: 16 },
  ];
  encabezado(falt);
  r.faltantes.forEach((f) => falt.addRow(f));

  const sin = libro.addWorksheet('Sin fila en el Excel');
  sin.columns = [
    { header: 'Id', key: 'id', width: 28 },
    { header: 'Comprobante', key: 'codigo', width: 14 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    {
      header: 'Importe',
      key: 'monto',
      width: 14,
      style: { numFmt: '"S/" #,##0.00' },
    },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Origen', key: 'origen', width: 16 },
    { header: 'Concepto', key: 'concepto', width: 60 },
  ];
  encabezado(sin);
  r.sinFila.forEach((s) => sin.addRow(s));
  return libro;
}
