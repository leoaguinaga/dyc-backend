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
const COLOR_BORDE = '#e5e7eb';
const COLOR_TEXTO = '#111827';
const COLOR_MUTED = '#6b7280';
const COLOR_MARCA = '#1e3a8a';

function badgeEstado(estadoEfectivo: string) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pendiente: { bg: '#fef3c7', fg: '#92400e', label: 'Pendiente' },
    vencido: { bg: '#fee2e2', fg: '#991b1b', label: 'Vencido' },
    pagado: { bg: '#dcfce7', fg: '#166534', label: 'Pagado' },
  };
  const s = map[estadoEfectivo] ?? map.pendiente;
  return {
    display: 'flex',
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    backgroundColor: s.bg,
    color: s.fg,
  } as const;
}

function estadoLabel(estadoEfectivo: string) {
  return { pendiente: 'Pendiente', vencido: 'Vencido', pagado: 'Pagado' }[estadoEfectivo] ?? estadoEfectivo;
}

export async function renderReportePagosPng(data: ReporteData): Promise<Buffer> {
  const filas = data.grupos.reduce((n, g) => n + g.pagos.length, 0);
  const alto = 165 + data.grupos.length * 50 + filas * 46 + 90;

  const titulo = data.tipo === 'pendientes' ? 'PAGOS PENDIENTES' : 'PAGOS REALIZADOS';

  // satori acepta un árbol tipo React sin JSX; el tipado estricto de ReactNode no modela esta forma.
  const tree = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: ANCHO,
          height: alto,
          backgroundColor: '#ffffff',
          fontFamily: 'Inter',
          padding: 32,
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 16,
                borderBottom: `3px solid ${COLOR_MARCA}`,
                marginBottom: 20,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', fontFamily: 'Inter-Bold', fontSize: 26, color: COLOR_MARCA },
                    children: titulo,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', fontSize: 20, color: COLOR_MUTED },
                          children: fmtFecha(data.fecha),
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', fontSize: 13, color: COLOR_MUTED },
                          children: `Generado ${fmtHora(data.generadoEn)}`,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          ...data.grupos.map((g) => ({
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', marginBottom: 20 },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      fontFamily: 'Inter-Bold',
                      fontSize: 18,
                      color: COLOR_TEXTO,
                      marginBottom: 8,
                    },
                    children: g.proyecto.nombre,
                  },
                },
                ...g.pagos.map((p) => ({
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: `1px solid ${COLOR_BORDE}`,
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', flexDirection: 'column', gap: 2 },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: { display: 'flex', fontSize: 15, color: COLOR_MUTED },
                                children: p.codigo,
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: { display: 'flex', fontSize: 16, color: COLOR_TEXTO },
                                children: p.concepto,
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', alignItems: 'center', gap: 12 },
                          children: [
                            { type: 'div', props: { style: badgeEstado(p.estadoEfectivo), children: estadoLabel(p.estadoEfectivo) } },
                            {
                              type: 'div',
                              props: {
                                style: { display: 'flex', fontFamily: 'Inter-Bold', fontSize: 16, color: COLOR_TEXTO, minWidth: 120, justifyContent: 'flex-end' },
                                children: fmtMonto(p.monto),
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                })),
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'flex-end',
                      fontFamily: 'Inter-Bold',
                      fontSize: 15,
                      color: COLOR_MUTED,
                      marginTop: 6,
                    },
                    children: `Subtotal: ${fmtMonto(g.subtotal)}`,
                  },
                },
              ],
            },
          })),
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
                paddingTop: 16,
                borderTop: `3px solid ${COLOR_MARCA}`,
              },
              children: [
                { type: 'div', props: { style: { display: 'flex', fontFamily: 'Inter-Bold', fontSize: 20, color: COLOR_MARCA }, children: 'TOTAL' } },
                { type: 'div', props: { style: { display: 'flex', fontFamily: 'Inter-Bold', fontSize: 22, color: COLOR_MARCA }, children: fmtMonto(data.total) } },
              ],
            },
          },
        ],
      },
    };

  const svg = await satori(tree as Parameters<typeof satori>[0], {
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
