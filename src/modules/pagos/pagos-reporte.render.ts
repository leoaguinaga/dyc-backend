import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { INTER_BOLD_BASE64, INTER_REGULAR_BASE64 } from './fonts.data.js';

const fontRegular = Buffer.from(INTER_REGULAR_BASE64, 'base64');
const fontBold = Buffer.from(INTER_BOLD_BASE64, 'base64');

const fmtMonto = (n: number) =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtFecha = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const fmtHora = (d: Date) =>
  d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

export interface ReportePagoRow {
  codigo: string;
  concepto: string;
  monto: number;
  estadoEfectivo: string;
  /** ISO yyyy-mm-dd; opcional para no romper consumidores previos. */
  fechaProgramada?: string;
}

export interface ReporteGrupo {
  proyecto: { nombre: string };
  pagos: ReportePagoRow[];
  subtotal: number;
}

export interface ReporteData {
  fecha: string;
  tipo: 'pendientes' | 'pagados';
  grupos: ReporteGrupo[];
  total: number;
  generadoEn: Date;
}

const ANCHO = 800;
const PAD = 32;
const COLOR_BORDE = '#e5e7eb';
const COLOR_TEXTO = '#111827';
const COLOR_MUTED = '#6b7280';
const COLOR_MARCA = '#1e3a8a';
const COLOR_VENCIDO = '#b91c1c';
const COLOR_PAGADO = '#166534';
const COLOR_FONDO_SUAVE = '#f3f4f6';

// Alturas explícitas: el alto total se calcula sumándolas, así la imagen nunca se corta.
const H_CABECERA = 64;
const H_RESUMEN = 72;
const H_GRUPO = 40;
const H_FILA = 34;
const H_PIE = 64;
const GAP_BLOQUE = 20;

type Nodo = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };
const el = (style: Record<string, unknown>, children?: unknown): Nodo => ({
  type: 'div',
  props: {
    style: Object.fromEntries(Object.entries({ display: 'flex', ...style }).filter(([, v]) => v !== undefined)),
    children,
  },
});

function fmtCorta(iso?: string) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}

function vencimiento(p: ReportePagoRow): { texto: string; color: string; bold: boolean } {
  const f = fmtCorta(p.fechaProgramada);
  if (p.estadoEfectivo === 'vencido') return { texto: `Venció ${f}`.trim(), color: COLOR_VENCIDO, bold: true };
  if (p.estadoEfectivo === 'pagado') return { texto: 'Pagado', color: COLOR_PAGADO, bold: true };
  return { texto: `Vence ${f}`.trim(), color: COLOR_MUTED, bold: false };
}

function fila(p: ReportePagoRow, ultima: boolean): Nodo {
  const v = vencimiento(p);
  return el(
    {
      height: H_FILA,
      alignItems: 'center',
      borderBottom: ultima ? 'none' : `1px solid ${COLOR_BORDE}`,
    },
    [
      el({ width: 120, fontSize: 14, color: COLOR_MUTED }, p.codigo),
      el(
        {
          flex: 1,
          minWidth: 0,
          fontSize: 15,
          color: COLOR_TEXTO,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          paddingRight: 12,
        },
        p.concepto,
      ),
      el(
        { width: 104, fontSize: 13, color: v.color, fontFamily: v.bold ? 'Inter-Bold' : 'Inter', whiteSpace: 'nowrap' },
        v.texto,
      ),
      el(
        { width: 112, justifyContent: 'flex-end', fontFamily: 'Inter-Bold', fontSize: 15, color: COLOR_TEXTO, whiteSpace: 'nowrap' },
        fmtMonto(p.monto),
      ),
    ],
  );
}

function grupo(g: ReporteGrupo): Nodo {
  return el({ flexDirection: 'column', marginBottom: GAP_BLOQUE }, [
    el(
      {
        height: H_GRUPO,
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLOR_FONDO_SUAVE,
        borderRadius: 6,
        padding: '0 12px',
        marginBottom: 2,
      },
      [
        el({ alignItems: 'center', flex: 1, minWidth: 0 }, [
          el(
            { fontFamily: 'Inter-Bold', fontSize: 16, color: COLOR_TEXTO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            g.proyecto.nombre,
          ),
          el({ fontSize: 13, color: COLOR_MUTED, marginLeft: 10, whiteSpace: 'nowrap' }, `${g.pagos.length} ${g.pagos.length === 1 ? 'pago' : 'pagos'}`),
        ]),
        el({ fontFamily: 'Inter-Bold', fontSize: 16, color: COLOR_MARCA, whiteSpace: 'nowrap' }, fmtMonto(g.subtotal)),
      ],
    ),
    el({ flexDirection: 'column', padding: '0 12px' }, g.pagos.map((p, i) => fila(p, i === g.pagos.length - 1))),
  ]);
}

function celdaResumen(etiqueta: string, valor: string, color = COLOR_TEXTO, ancho?: number): Nodo {
  return el(
    { flexDirection: 'column', justifyContent: 'center', flex: ancho ? undefined : 1, width: ancho, height: '100%' },
    [
      el({ fontSize: 12, color: COLOR_MUTED, marginBottom: 4 }, etiqueta.toUpperCase()),
      el({ fontFamily: 'Inter-Bold', fontSize: 22, color }, valor),
    ],
  );
}

export async function renderReportePagosPng(data: ReporteData): Promise<Buffer> {
  const filas = data.grupos.reduce((n, g) => n + g.pagos.length, 0);
  const alto =
    PAD * 2 +
    H_CABECERA + GAP_BLOQUE +
    H_RESUMEN + GAP_BLOQUE +
    data.grupos.length * (H_GRUPO + 2 + GAP_BLOQUE) +
    filas * H_FILA +
    H_PIE;

  const titulo = data.tipo === 'pendientes' ? 'PAGOS PENDIENTES' : 'PAGOS REALIZADOS';
  const todos = data.grupos.flatMap((g) => g.pagos);
  const vencido = todos.filter((p) => p.estadoEfectivo === 'vencido').reduce((s, p) => s + p.monto, 0);
  const porVencer = data.total - vencido;

  const celdas: Nodo[] =
    data.tipo === 'pendientes'
      ? [
          celdaResumen('Total a pagar', fmtMonto(data.total), COLOR_MARCA),
          celdaResumen('Vencido', fmtMonto(vencido), vencido > 0 ? COLOR_VENCIDO : COLOR_TEXTO),
          celdaResumen('Por vencer', fmtMonto(porVencer)),
          celdaResumen('Pagos', `${filas}`, COLOR_TEXTO, 80),
        ]
      : [
          celdaResumen('Total pagado', fmtMonto(data.total), COLOR_MARCA),
          celdaResumen('Pagos', `${filas}`),
          celdaResumen('Proyectos', `${data.grupos.length}`),
        ];

  const tree = el(
    {
      flexDirection: 'column',
      width: ANCHO,
      height: alto,
      backgroundColor: '#ffffff',
      fontFamily: 'Inter',
      padding: PAD,
    },
    [
      el(
        {
          height: H_CABECERA,
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `3px solid ${COLOR_MARCA}`,
          paddingBottom: 12,
          marginBottom: GAP_BLOQUE,
        },
        [
          el({ fontFamily: 'Inter-Bold', fontSize: 26, color: COLOR_MARCA }, titulo),
          el({ flexDirection: 'column', alignItems: 'flex-end' }, [
            el({ fontSize: 20, color: COLOR_TEXTO }, fmtFecha(data.fecha)),
            el({ fontSize: 13, color: COLOR_MUTED }, `Generado ${fmtHora(data.generadoEn)}`),
          ]),
        ],
      ),
      el(
        {
          height: H_RESUMEN,
          alignItems: 'center',
          border: `1px solid ${COLOR_BORDE}`,
          borderRadius: 8,
          padding: '0 20px',
          marginBottom: GAP_BLOQUE,
        },
        celdas,
      ),
      ...data.grupos.map(grupo),
      el(
        {
          height: H_PIE,
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `3px solid ${COLOR_MARCA}`,
        },
        [
          el({ fontFamily: 'Inter-Bold', fontSize: 20, color: COLOR_MARCA }, 'TOTAL'),
          el({ fontFamily: 'Inter-Bold', fontSize: 24, color: COLOR_MARCA }, fmtMonto(data.total)),
        ],
      ),
    ],
  );

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: ANCHO,
    height: alto,
    fonts: [
      { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Inter-Bold', data: fontBold, weight: 700, style: 'normal' },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: ANCHO } });
  return resvg.render().asPng();
}
