import ExcelJS from 'exceljs';
import type { PrismaClient } from '../../../prisma/types.js';
import type {
  FilaPlan,
  PlanImportacion,
} from '../importacion/importacion.service.js';

const DIA_MS = 86_400_000;

export interface PagoSistema {
  id: string;
  estado: string;
  monto: number;
  fecha: Date;
  obra: string;
  beneficiario: string;
  concepto: string;
}

export interface ResultadoConciliacion {
  /** Filas del Excel que no están en el sistema: hay que registrarlas. */
  faltan: FilaPlan[];
  /** Filas del Excel que ya están en el sistema sin código: se enlazan y, si estaban pendientes, pasan a pagado. */
  enlazables: { fila: FilaPlan; pago: PagoSistema | null }[];
  /** Filas dudosas (varios candidatos, o mismo código con otro importe). */
  dudosas: { fila: FilaPlan; candidatos: PagoSistema[] }[];
  yaCargadas: number;
  conError: FilaPlan[];
  /** Pagos del sistema sin código que ninguna fila del Excel respalda. */
  sistemaSinExcel: PagoSistema[];
  montoFaltante: number;
}

/**
 * Cruza el plan de una simulación (con `vincular`) contra la base y devuelve las
 * listas de trabajo. Solo lee; no escribe nada.
 */
export async function conciliar(
  prisma: PrismaClient,
  plan: PlanImportacion,
): Promise<ResultadoConciliacion> {
  const ids = new Set<string>();
  for (const f of plan.filas) {
    if (f.pagoExistenteId) ids.add(f.pagoExistenteId);
    for (const c of f.candidatos ?? []) ids.add(c);
  }
  const descritos = await describirPagos(prisma, { id: { in: [...ids] } });
  const porId = new Map(descritos.map((p) => [p.id, p]));

  const fechas = plan.filas
    .filter((f) => f.datos)
    .map((f) => f.datos!.fecha.getTime());
  let sistemaSinExcel: PagoSistema[] = [];
  if (fechas.length) {
    const margen = 30 * DIA_MS;
    const rango = {
      gte: new Date(Math.min(...fechas) - margen),
      lte: new Date(Math.max(...fechas) + margen),
    };
    const sueltos = await describirPagos(prisma, {
      codigoComprobante: null,
      estado: { in: ['pagado', 'pendiente'] },
      OR: [{ fechaPagoReal: rango }, { fechaProgramada: rango }],
    });
    const respaldados = new Set(
      plan.filas
        .filter((f) => f.accion === 'vincular')
        .map((f) => f.pagoExistenteId),
    );
    sistemaSinExcel = sueltos.filter((p) => !respaldados.has(p.id));
  }

  const faltan = plan.filas.filter((f) => f.accion === 'crear');
  return {
    faltan,
    enlazables: plan.filas
      .filter((f) => f.accion === 'vincular')
      .map((fila) => ({
        fila,
        pago: porId.get(fila.pagoExistenteId!) ?? null,
      })),
    dudosas: plan.filas
      .filter((f) => f.accion === 'revisar')
      .map((fila) => ({
        fila,
        candidatos: [
          ...(fila.candidatos ?? []),
          ...(fila.pagoExistenteId ? [fila.pagoExistenteId] : []),
        ]
          .map((id) => porId.get(id))
          .filter((p): p is PagoSistema => !!p),
      })),
    yaCargadas: plan.filas.filter((f) => f.accion === 'omitir').length,
    conError: plan.filas.filter((f) => f.accion === 'error'),
    sistemaSinExcel,
    montoFaltante: faltan.reduce((s, f) => s + (f.datos?.monto ?? 0), 0),
  };
}

async function describirPagos(
  prisma: PrismaClient,
  where: object,
): Promise<PagoSistema[]> {
  const pagos = await prisma.pago.findMany({
    where,
    select: {
      id: true,
      estado: true,
      monto: true,
      fechaProgramada: true,
      fechaPagoReal: true,
      concepto: true,
      beneficiarioNombre: true,
      proyecto: { select: { codigo: true } },
      ordenCompra: {
        select: {
          proyecto: { select: { codigo: true } },
          proveedor: { select: { razonSocial: true } },
        },
      },
    },
  });
  return pagos.map((p) => ({
    id: p.id,
    estado: p.estado,
    monto: Number(p.monto),
    fecha: p.fechaPagoReal ?? p.fechaProgramada,
    obra: p.proyecto?.codigo ?? p.ordenCompra?.proyecto?.codigo ?? '',
    beneficiario:
      p.beneficiarioNombre ?? p.ordenCompra?.proveedor?.razonSocial ?? '',
    concepto: p.concepto ?? '',
  }));
}

export function construirConciliacion(
  r: ResultadoConciliacion,
  archivo: string,
): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  const estilar = (hoja: ExcelJS.Worksheet) => {
    const fila = hoja.getRow(1);
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    fila.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A3557' },
    };
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const MONEDA = { numFmt: '"S/" #,##0.00' };
  const FECHA = { numFmt: 'dd/mm/yyyy' };

  const resumen = libro.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Concepto', key: 'c', width: 70 },
    { header: 'Valor', key: 'v', width: 22 },
  ];
  estilar(resumen);
  const soles = (n: number) =>
    n.toLocaleString('es-PE', { minimumFractionDigits: 2 });
  for (const [c, v] of [
    ['Archivo', archivo],
    ['FALTAN REGISTRAR: están en el Excel y no en el sistema', r.faltan.length],
    ['  Importe total de lo que falta (S/)', soles(r.montoFaltante)],
    [
      'YA REGISTRADOS sin código (se enlazan con --vincular)',
      r.enlazables.length,
    ],
    [
      '  de ellos, hoy figuran pendientes y el Excel los da por pagados',
      r.enlazables.filter((e) => e.pago?.estado === 'pendiente').length,
    ],
    [
      'DUDOSOS: varios candidatos o mismo código con otro importe',
      r.dudosas.length,
    ],
    ['Ya cargados con su comprobante', r.yaCargadas],
    ['Con error en el Excel (corregir antes)', r.conError.length],
    [
      'EN EL SISTEMA SIN FILA EN EL EXCEL (sin código)',
      r.sistemaSinExcel.length,
    ],
  ] as [string, string | number][])
    resumen.addRow({ c, v });

  const faltan = libro.addWorksheet('Faltan registrar');
  faltan.columns = [
    { header: 'Fila Excel', key: 'fila', width: 11 },
    { header: 'Comprobante', key: 'comp', width: 14 },
    { header: 'Fecha', key: 'fecha', width: 12, style: FECHA },
    { header: 'Importe', key: 'monto', width: 14, style: MONEDA },
    { header: 'Obra', key: 'obra', width: 16 },
    { header: 'Beneficiario', key: 'ben', width: 36 },
    { header: 'Concepto', key: 'concepto', width: 50 },
    { header: 'Avisos', key: 'avisos', width: 60 },
  ];
  estilar(faltan);
  for (const f of r.faltan)
    faltan.addRow({
      fila: f.fila,
      comp: f.comprobante,
      fecha: f.datos?.fecha,
      monto: f.datos?.monto,
      obra: f.datos?.proyecto.codigo ?? '',
      ben: f.datos?.beneficiarioNombre ?? '',
      concepto: f.datos?.concepto ?? '',
      avisos: f.mensajes.map((m) => m.texto).join(' | '),
    });

  const cols = [
    { header: 'Fila Excel', key: 'fila', width: 11 },
    { header: 'Comprobante', key: 'comp', width: 14 },
    { header: 'Fecha Excel', key: 'fecha', width: 12, style: FECHA },
    { header: 'Importe Excel', key: 'monto', width: 14, style: MONEDA },
    { header: 'Beneficiario Excel', key: 'ben', width: 34 },
    { header: 'Pago en sistema', key: 'id', width: 28 },
    { header: 'Estado', key: 'estado', width: 11 },
    { header: 'Fecha sistema', key: 'fechaS', width: 13, style: FECHA },
    { header: 'Importe sistema', key: 'montoS', width: 14, style: MONEDA },
    { header: 'Beneficiario sistema', key: 'benS', width: 34 },
  ];
  const enl = libro.addWorksheet('Ya registrados (enlazar)');
  enl.columns = cols;
  estilar(enl);
  for (const { fila: f, pago: p } of r.enlazables)
    enl.addRow({
      fila: f.fila,
      comp: f.comprobante,
      fecha: f.datos?.fecha,
      monto: f.datos?.monto,
      ben: f.datos?.beneficiarioNombre ?? '',
      id: p?.id,
      estado: p?.estado,
      fechaS: p?.fecha,
      montoS: p?.monto,
      benS: p?.beneficiario,
    });

  const dud = libro.addWorksheet('Dudosos');
  dud.columns = cols;
  estilar(dud);
  for (const { fila: f, candidatos } of r.dudosas) {
    const base = {
      fila: f.fila,
      comp: f.comprobante,
      fecha: f.datos?.fecha,
      monto: f.datos?.monto,
      ben: f.datos?.beneficiarioNombre ?? '',
    };
    if (!candidatos.length)
      dud.addRow({ ...base, id: f.mensajes.map((m) => m.texto).join(' | ') });
    for (const p of candidatos)
      dud.addRow({
        ...base,
        id: p.id,
        estado: p.estado,
        fechaS: p.fecha,
        montoS: p.monto,
        benS: p.beneficiario,
      });
  }

  const sin = libro.addWorksheet('Sistema sin Excel');
  sin.columns = [
    { header: 'Pago en sistema', key: 'id', width: 28 },
    { header: 'Estado', key: 'estado', width: 11 },
    { header: 'Fecha', key: 'fecha', width: 12, style: FECHA },
    { header: 'Importe', key: 'monto', width: 14, style: MONEDA },
    { header: 'Obra', key: 'obra', width: 16 },
    { header: 'Beneficiario', key: 'ben', width: 36 },
    { header: 'Concepto', key: 'concepto', width: 50 },
  ];
  estilar(sin);
  for (const p of r.sistemaSinExcel) sin.addRow({ ...p, ben: p.beneficiario });

  const err = libro.addWorksheet('Con error');
  err.columns = [
    { header: 'Fila Excel', key: 'fila', width: 11 },
    { header: 'Comprobante', key: 'comp', width: 14 },
    { header: 'Motivo', key: 'm', width: 110 },
  ];
  estilar(err);
  for (const f of r.conError)
    err.addRow({
      fila: f.fila,
      comp: f.comprobante,
      m: f.mensajes.map((m) => m.texto).join(' | '),
    });
  return libro;
}
