import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { ReportesQueryService } from './reportes-query.service.js';
import { ReportesService } from './reportes.service.js';
import { ReportesController } from './reportes.controller.js';
import { construirWorkbookReporte } from './reportes-excel.builder.js';
import {
  acumularMetrica,
  crearEstadoMetrica,
  finalizarMetrica,
} from './reportes-aggregation.util.js';
import {
  CATALOGO_REPORTES,
  getCampoMeta,
  getEntidadMeta,
} from './catalogo/index.js';
import { PRESETS_REPORTES } from './catalogo/presets.js';
import { hoyLima } from '../../shared/date/fecha.util.js';
import { fn, prismaMock, type PrismaMock } from '../../testing/mocks.js';

function setup() {
  const prisma: PrismaMock = prismaMock();
  return { prisma, service: new ReportesQueryService(prisma as never) };
}

const PAGOS = [
  {
    estado: 'pagado',
    monto: '100.50',
    fechaProgramada: new Date(2026, 8, 3),
    ordenCompra: { numero: 'OC-1' },
  },
  {
    estado: 'pagado',
    monto: '50',
    fechaProgramada: new Date(2026, 8, 20),
    ordenCompra: { numero: 'OC-1' },
  },
  {
    estado: 'pendiente',
    monto: '30',
    fechaProgramada: new Date(2026, 9, 1),
    ordenCompra: null,
  },
];

describe('catálogo de reportes', () => {
  it('cada preset apunta a entidades y campos existentes', () => {
    for (const q of Object.values(PRESETS_REPORTES)) {
      const meta = getEntidadMeta(q.entidad);
      for (const key of [
        ...(q.agruparPor ?? []),
        ...(q.columnas ?? []),
        ...(q.metricas ?? []).map((m) => m.campo),
      ]) {
        expect(meta.campos.some((c) => c.key === key)).toBe(true);
      }
    }
  });

  it('cada entidad tiene campos con ruta y operadores', () => {
    for (const meta of Object.values(CATALOGO_REPORTES)) {
      expect(meta.campos.length).toBeGreaterThan(0);
      for (const c of meta.campos) expect(c.path.length).toBeGreaterThan(0);
    }
  });

  it('rechaza entidades o campos desconocidos', () => {
    expect(() => getEntidadMeta('foo')).toThrow(BadRequestException);
    expect(() => getCampoMeta('pago', 'foo')).toThrow(
      'Campo "foo" no existe en la entidad "pago"',
    );
  });
});

describe('agregación', () => {
  it('count cuenta valores no nulos; sum/avg/min/max ignoran no numéricos', () => {
    const count = crearEstadoMetrica('count');
    [1, null, 'x', undefined].forEach((v) => acumularMetrica(count, v));
    expect(finalizarMetrica(count)).toBe(2);
    const valores = ['10', 5, 'abc', null];
    const r = Object.fromEntries(
      (['sum', 'avg', 'min', 'max'] as const).map((f) => {
        const e = crearEstadoMetrica(f);
        valores.forEach((v) => acumularMetrica(e, v));
        return [f, finalizarMetrica(e)];
      }),
    );
    expect(r).toEqual({ sum: 15, avg: 7.5, min: 5, max: 10 });
    expect(finalizarMetrica(crearEstadoMetrica('avg'))).toBe(0);
    expect(finalizarMetrica(crearEstadoMetrica('min'))).toBe(0);
    expect(finalizarMetrica(crearEstadoMetrica('max'))).toBe(0);
  });
});

describe('ReportesQueryService — detalle', () => {
  it('trae columnas pedidas, convierte decimales y respeta el límite', async () => {
    const { service, prisma } = setup();
    prisma.pago.findMany.mockResolvedValue(PAGOS);
    const r = await service.ejecutar({
      entidad: 'pago',
      columnas: ['estado', 'monto', 'ordenCompra.numero'],
      limite: 10000,
    });
    const args = prisma.pago.findMany.mock.calls[0][0];
    expect(args.take).toBe(5000);
    expect(args.select).toEqual({
      estado: true,
      monto: true,
      ordenCompra: { select: { numero: true } },
    });
    expect(r.columnas.map((c) => c.key)).toEqual([
      'estado',
      'monto',
      'ordenCompra.numero',
    ]);
    expect(r.filas[0]).toEqual({
      estado: 'pagado',
      monto: 100.5,
      'ordenCompra.numero': 'OC-1',
    });
    expect(r.filas[2]['ordenCompra.numero']).toBeNull();
  });

  it('sin columnas usa todos los campos no virtuales y el límite por defecto', async () => {
    const { service, prisma } = setup();
    await service.ejecutar({ entidad: 'pago' });
    const args = prisma.pago.findMany.mock.calls[0][0];
    expect(args.take).toBe(500);
    expect(Object.keys(args.select)).not.toContain('mesProgramado');
  });

  it('traduce filtros a where de Prisma con conversión de tipos', async () => {
    const { service, prisma } = setup();
    await service.ejecutar({
      entidad: 'pago',
      filtros: [
        { campo: 'estado', operador: 'in', valor: ['pagado', 'pendiente'] },
        { campo: 'monto', operador: 'between', valor: ['10', '200'] },
        { campo: 'fechaProgramada', operador: 'gte', valor: '2026-09-01' },
        { campo: 'metodoPago', operador: 'contains', valor: 'trans' },
        { campo: 'ordenCompra.numero', operador: 'eq', valor: 'OC-1' },
        { campo: 'estado', operador: 'neq', valor: 'cancelado' },
      ],
    } as never);
    const where = prisma.pago.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      estado: { in: ['pagado', 'pendiente'], not: 'cancelado' },
      monto: { gte: 10, lte: 200 },
      fechaProgramada: { gte: new Date('2026-09-01') },
      metodoPago: { contains: 'trans', mode: 'insensitive' },
      ordenCompra: { numero: { equals: 'OC-1' } },
    });
  });

  it('cubre los operadores de comparación', async () => {
    const { service, prisma } = setup();
    for (const operador of ['eq', 'gt', 'lt', 'lte']) {
      await service.ejecutar({
        entidad: 'pago',
        filtros: [{ campo: 'monto', operador, valor: 5 }],
      } as never);
    }
    expect(
      prisma.pago.findMany.mock.calls.map((c: any) => c[0].where.monto),
    ).toEqual([{ equals: 5 }, { gt: 5 }, { lt: 5 }, { lte: 5 }]);
  });

  it('valida operador permitido y valores', async () => {
    const { service } = setup();
    const run = (filtro: object) =>
      service.ejecutar({ entidad: 'pago', filtros: [filtro] } as never);
    await expect(
      run({ campo: 'estado', operador: 'gt', valor: 'x' }),
    ).rejects.toThrow(/no está permitido/);
    await expect(
      run({ campo: 'estado', operador: 'eq', valor: 'inventado' }),
    ).rejects.toThrow(/no es válido para el campo enum/);
    await expect(
      run({ campo: 'monto', operador: 'gt', valor: 'abc' }),
    ).rejects.toThrow(/numérico inválido/);
    await expect(
      run({ campo: 'fechaProgramada', operador: 'gt', valor: 'no-fecha' }),
    ).rejects.toThrow(/fecha inválido/);
    await expect(
      run({ campo: 'estado', operador: 'in', valor: [] }),
    ).rejects.toThrow(/requiere un arreglo/);
    await expect(
      run({ campo: 'monto', operador: 'between', valor: [1] }),
    ).rejects.toThrow(/requiere \[desde, hasta\]/);
  });

  it('acepta booleanos como texto y rechaza otros valores', async () => {
    const { service, prisma } = setup();
    const campoBool = Object.values(CATALOGO_REPORTES)
      .flatMap((m) => m.campos.map((c) => ({ m, c })))
      .find(({ c }) => c.tipo === 'boolean');
    if (!campoBool) return;
    const { m, c } = campoBool;
    const delegate = (prisma as any)[m.modeloPrisma];
    await service.ejecutar({
      entidad: m.entidad,
      filtros: [{ campo: c.key, operador: 'eq', valor: 'true' }],
    } as never);
    await service.ejecutar({
      entidad: m.entidad,
      filtros: [{ campo: c.key, operador: 'eq', valor: false }],
    } as never);
    await service.ejecutar({
      entidad: m.entidad,
      filtros: [{ campo: c.key, operador: 'eq', valor: 'false' }],
    } as never);
    expect(delegate.findMany).toHaveBeenCalledTimes(3);
    await expect(
      service.ejecutar({
        entidad: m.entidad,
        filtros: [{ campo: c.key, operador: 'eq', valor: 'quizas' }],
      } as never),
    ).rejects.toThrow(/booleano inválido/);
  });
});

describe('ReportesQueryService — agregado', () => {
  it('agrupa por mes virtual y calcula métricas', async () => {
    const { service, prisma } = setup();
    prisma.pago.findMany.mockResolvedValue(PAGOS);
    const r = await service.ejecutar({
      entidad: 'pago',
      agruparPor: ['mesProgramado', 'estado'],
      metricas: [
        { campo: 'monto', funcion: 'sum' },
        { campo: 'id', funcion: 'count' },
      ],
    } as never);
    expect(prisma.pago.findMany.mock.calls[0][0].take).toBe(5000);
    expect(r.columnas.map((c) => c.key)).toEqual([
      'mesProgramado',
      'estado',
      'monto_sum',
      'id_count',
    ]);
    expect(r.filas).toEqual([
      {
        mesProgramado: '2026-09',
        estado: 'pagado',
        monto_sum: 150.5,
        id_count: 0,
      },
      {
        mesProgramado: '2026-10',
        estado: 'pendiente',
        monto_sum: 30,
        id_count: 0,
      },
    ]);
  });

  it('valida agrupación y métricas', async () => {
    const { service } = setup();
    await expect(
      service.ejecutar({ entidad: 'pago', agruparPor: ['monto'] }),
    ).rejects.toThrow(/no es agrupable/);
    await expect(
      service.ejecutar({
        entidad: 'pago',
        metricas: [{ campo: 'estado', funcion: 'sum' }],
      } as never),
    ).rejects.toThrow(/requiere un campo numérico/);
    const sinMetrica = Object.values(CATALOGO_REPORTES)
      .flatMap((m) => m.campos.map((c) => ({ m, c })))
      .find(
        ({ c }) => (c.tipo === 'number' || c.tipo === 'decimal') && !c.metrica,
      );
    if (sinMetrica) {
      await expect(
        service.ejecutar({
          entidad: sinMetrica.m.entidad,
          metricas: [{ campo: sinMetrica.c.key, funcion: 'avg' }],
        } as never),
      ).rejects.toThrow(/no admite agregación/);
    }
  });

  it('el mes virtual tolera fechas nulas o inválidas', async () => {
    const { service, prisma } = setup();
    prisma.pago.findMany.mockResolvedValue([
      { fechaProgramada: null },
      { fechaProgramada: 'no-fecha' },
      { fechaProgramada: '2026-01-15T12:00:00Z' },
    ]);
    const r = await service.ejecutar({
      entidad: 'pago',
      agruparPor: ['mesProgramado'],
      metricas: [],
    });
    expect(r.filas.map((f) => f.mesProgramado)).toEqual([null, '2026-01']);
  });
});

describe('ReportesService (reportes fijos)', () => {
  it('gasto por proyecto y OCs por proveedor ordenan por monto', async () => {
    const prisma = prismaMock();
    const service = new ReportesService(prisma as never);
    const p1 = { id: 'p1', codigo: null, nombre: 'A' };
    const p2 = { id: 'p2', codigo: '26-1', nombre: 'B' };
    prisma.ordenCompra.findMany.mockResolvedValueOnce([
      { montoTotal: '100', proyecto: p1 },
      { montoTotal: '50', proyecto: p1 },
      { montoTotal: '500', proyecto: p2 },
    ]);
    const gasto = await service.gastoPorProyecto({
      desde: '2026-01-01',
      hasta: '2026-12-31',
    });
    expect(gasto.map((g) => [g.proyecto.id, g.totalOcs, g.montoTotal])).toEqual(
      [
        ['p2', 1, 500],
        ['p1', 2, 150],
      ],
    );
    expect(prisma.ordenCompra.findMany.mock.calls[0][0].where.creadoEn).toEqual(
      { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') },
    );

    prisma.ordenCompra.findMany.mockResolvedValueOnce([
      { montoTotal: '10', proveedor: { id: 'x', razonSocial: 'X' } },
      { montoTotal: '5', proveedor: null },
      { montoTotal: '20', proveedor: { id: 'x', razonSocial: 'X' } },
    ]);
    expect(await service.ocsPorProveedor({})).toEqual([
      { proveedor: { id: 'x', razonSocial: 'X' }, totalOcs: 2, montoTotal: 30 },
    ]);
    expect(
      prisma.ordenCompra.findMany.mock.calls[1][0].where.creadoEn,
    ).toBeUndefined();
  });

  it('pagos por periodo separa pagado, pendiente y vencido', async () => {
    const prisma = prismaMock();
    const service = new ReportesService(prisma as never);
    const futuro = new Date(hoyLima().getTime() + 40 * 86_400_000);
    prisma.pago.findMany.mockResolvedValue([
      { estado: 'pagado', monto: '10', fechaProgramada: new Date(2020, 0, 5) },
      {
        estado: 'pendiente',
        monto: '5',
        fechaProgramada: new Date(2020, 0, 9),
      },
      { estado: 'pendiente', monto: '7', fechaProgramada: futuro },
    ]);
    const r = await service.pagosPorPeriodo({ desde: '2020-01-01' });
    expect(r[0]).toEqual({
      periodo: '2020-01',
      pagado: 10,
      pendiente: 0,
      vencido: 5,
    });
    expect(r[1].pendiente).toBe(7);
  });
});

describe('ReportesController', () => {
  it('expone catálogo y presets sin la ruta interna de Prisma', () => {
    const controller = new ReportesController({} as never, {} as never);
    const { entidades, presets } = controller.entidades();
    expect(entidades.pago).toEqual(
      expect.objectContaining({ entidad: 'pago', label: 'Pagos' }),
    );
    expect(entidades.pago).not.toHaveProperty('modeloPrisma');
    expect(presets).toBe(PRESETS_REPORTES);
  });

  it('exporta el resultado como .xlsx con encabezados', async () => {
    const queryService = {
      ejecutar: fn(() =>
        Promise.resolve({
          columnas: [{ key: 'estado', label: 'Estado', tipo: 'enum' }],
          filas: [{ estado: 'pagado' }],
        }),
      ),
    };
    const controller = new ReportesController(
      {} as never,
      queryService as never,
    );
    const res = { set: fn(), send: fn() };
    await controller.queryExport({ entidad: 'pago' }, res as never);
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'attachment; filename="reporte.xlsx"',
      }),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.send.mock.calls[0][0]);
    const sheet = workbook.getWorksheet('Reporte')!;
    expect(sheet.getRow(1).getCell(1).value).toBe('Estado');
    expect(sheet.getRow(2).getCell(1).value).toBe('pagado');
  });

  it('el workbook ajusta el ancho mínimo de columna', async () => {
    const buffer = await construirWorkbookReporte({
      columnas: [{ key: 'a', label: 'A', tipo: 'string' }],
      filas: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.getWorksheet('Reporte')!.getColumn(1).width).toBe(14);
  });
});
