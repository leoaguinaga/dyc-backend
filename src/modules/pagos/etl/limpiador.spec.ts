import type { FilaCruda } from '../importacion/lector-xlsx.js';
import type { CatalogosDatos } from './catalogos.js';
import { buscarEnCatalogo, levenshtein } from './coincidencia.js';
import {
  limpiarMaestra,
  parseCorrelativo,
  proponerDecision,
} from './limpiador.js';
import type { DecisionCentro, OpcionesLimpieza } from './limpiador.js';

type Valores = Record<string, unknown>;

/** Fila del Excel real, con el comprobante correlativo `n` (2601 = 26-0001). */
function fila(n: number, extra: Valores = {}, filaExcel = n + 2): FilaCruda {
  // Como en el Excel real: 1 → 2601, 99 → 2699, 185 → 26185, 2248 → 262248.
  const cod = `26${n < 100 ? String(n).padStart(2, '0') : n}`;
  return {
    fila: filaExcel,
    valores: {
      subComprobante: Number(`${cod}.1`),
      comprobante: cod,
      fecha: new Date(Date.UTC(2026, 7, 1 + Math.floor(n / 50))),
      importe: 100 + n,
      tipoOperacion: 'TRANSFERENCIA',
      banco: 'BCP-D&C INGENIERIA Y PROYECTOS',
      cuenta: '305-98401930-95',
      tipoGasto: 'VIATICOS',
      detalle: `GASTO ${n}`,
      responsable: 'ADMINISTRACION',
      proveedor: 'NO APLICA',
      cuentaProveedor: 0,
      centroCosto: '022-ING-26',
      descCentroCosto: 'VIDEO WALL PUCALLPA',
      importeRendido: 100 + n,
      generoComprobante: 'JESSICA MEDRANO CARRASCO',
      estadoRendicion: 'CERRADO',
      empresa: 'D&C INGENIERIA Y PROYECTOS SAC',
      ruc: '20608745611',
      ...extra,
    },
  };
}

const CATALOGOS: CatalogosDatos = {
  centros: [
    { codigo: '022-ING-26', descripcion: 'VIDEO WALL PUCALLPA' },
    {
      codigo: '017- ING-26',
      descripcion:
        'IMPLEMENTACIÓN DE TIENDA ADIDAS KIDS MALL AVENTURA CHICLAYO',
    },
    {
      codigo: 'OFICINA CHICLAYO',
      descripcion: 'GASTOS DIVERSOS DE LA EMPRESA',
    },
    { codigo: '024-ING-26', descripcion: 'CERRAMIENTO ENTEL' },
  ],
  proveedores: [
    { nombre: 'QUISPE CAJUSOL EFRAIN', cuentas: ['30577202293'] },
    { nombre: 'AMSEQ 3A', cuentas: ['3052300140045', 'CUENTA RECAUDADORA'] },
  ],
  tiposGasto: ['VIATICOS'],
  responsables: ['DANIEL SANCHEZ FERNANDEZ', 'PALMA MENDOZA CARLOS LUIS'],
  empresas: [
    { razonSocial: 'D&C INGENIERIA Y PROYECTOS SAC', ruc: '20608745611' },
  ],
  tiposOperacion: ['TRANSFERENCIA', 'CHEQUE', 'ANULADA'],
};

function limpiar(filas: FilaCruda[], extra: Partial<OpcionesLimpieza> = {}) {
  return limpiarMaestra(filas, {
    catalogos: CATALOGOS,
    decisiones: new Map(),
    correcciones: [],
    ...extra,
  });
}

describe('limpiarMaestra — comprobantes', () => {
  it('lleva 2601, 26185 y 262248 (con sub numérico de Excel) a AA-NNNN y línea', () => {
    const r = limpiar([fila(1), fila(185), fila(2248)]);
    expect(r.filas.map((f) => `${f.codigo}.${f.subNumero}`)).toEqual([
      '26-0001.1',
      '26-0185.1',
      '26-2248.1',
    ]);
  });

  it('ordena por correlativo aunque la hoja esté desordenada (96-0099 antes que 26-0100)', () => {
    const r = limpiar([fila(100), fila(99), fila(2)]);
    expect(r.filas.map((f) => f.codigo)).toEqual([
      '26-0002',
      '26-0099',
      '26-0100',
    ]);
  });

  it('una fila sin comprobante legible se excluye y se avisa', () => {
    const r = limpiar([fila(1, { comprobante: 'ABC', subComprobante: '' })]);
    expect(r.filas).toHaveLength(0);
    expect(r.exclusiones[0]).toMatchObject({ motivo: 'comprobante-ilegible' });
    expect(r.excepciones[0]).toMatchObject({
      tipo: 'comprobante-ilegible',
      severidad: 'revisar',
    });
  });

  it('dos gastos distintos con la misma línea: la segunda pasa a ser la línea .2 y queda registrado', () => {
    const a = fila(1671, { importe: 640, centroCosto: '022-ING-26' });
    const b = fila(1671, {
      importe: 240,
      centroCosto: '021-ING-26',
      detalle: 'FLETE',
    });
    const r = limpiar([a, b]);
    expect(r.filas.map((f) => `${f.codigo}.${f.subNumero}`)).toEqual([
      '26-1671.1',
      '26-1671.2',
    ]);
    expect(r.cambios.find((c) => c.regla === 'sub-renumerado')).toMatchObject({
      original: '26-1671.1',
      nuevo: '26-1671.2',
    });
    expect(r.exclusiones).toHaveLength(0);
  });

  it('una fila idéntica a otra es un duplicado y se excluye', () => {
    const r = limpiar([fila(1671), fila(1671)]);
    expect(r.filas).toHaveLength(1);
    expect(r.exclusiones[0]).toMatchObject({ motivo: 'duplicada' });
  });

  it('las líneas .1 y .2 legítimas se conservan', () => {
    const dos = fila(184, { subComprobante: 26184.2, importe: 50 });
    const r = limpiar([fila(184), dos]);
    expect(r.filas.map((f) => f.subNumero)).toEqual([1, 2]);
  });

  it('reporta huecos del correlativo', () => {
    const r = limpiar([fila(10), fila(11), fila(14)]);
    expect(
      r.excepciones.find((e) => e.tipo === 'hueco-correlativo')?.detalle,
    ).toBe('Faltan los comprobantes 12 al 13');
  });
});

describe('limpiarMaestra — fechas', () => {
  it('las fechas escritas como texto (con espacio) pasan a fecha real y se registran', () => {
    const r = limpiar([fila(185, { fecha: ' 28/01/2026' })]);
    expect(r.filas[0].fecha.toISOString().slice(0, 10)).toBe('2026-01-28');
    expect(r.cambios[0]).toMatchObject({
      regla: 'fecha-texto',
      original: ' 28/01/2026',
      nuevo: '2026-01-28',
    });
    expect(r.conteos.fechasEnTexto).toBe(1);
  });

  it('una fecha ilegible excluye la fila y pide corregirla', () => {
    const r = limpiar([fila(1, { fecha: 'mañana' })]);
    expect(r.filas).toHaveLength(0);
    expect(r.exclusiones[0].motivo).toBe('fecha-invalida');
    expect(r.excepciones[0]).toMatchObject({
      tipo: 'fecha-invalida',
      columna: 'fecha',
    });
  });

  const serie = (n: number, fecha: Date) => fila(n, { fecha });
  const dia = (d: number) => new Date(Date.UTC(2026, 7, d));

  it('detecta una fecha fuera de la secuencia de sus vecinos y sugiere el día/mes invertido', () => {
    // vecinos alrededor del 3 de agosto; la fila del medio dice 8 de marzo (03/08 tecleado como 08/03)
    const filas = [20, 21, 22, 23, 24].map((n) => serie(n, dia(3)));
    filas.push(serie(25, new Date(Date.UTC(2026, 2, 8))));
    filas.push(...[26, 27, 28, 29, 30].map((n) => serie(n, dia(3))));
    const r = limpiar(filas);
    const e = r.excepciones.find((x) => x.tipo === 'fecha-fuera-de-secuencia')!;
    expect(e).toMatchObject({
      comprobante: '26-0025.1',
      severidad: 'revisar',
      columna: 'fecha',
    });
    expect(e.sugerencia).toContain('invertidos');
    expect(e.sugerencia).toContain('03/08/2026');
    // los vecinos no se marcan por culpa del atípico
    expect(
      r.excepciones.filter((x) => x.tipo === 'fecha-fuera-de-secuencia'),
    ).toHaveLength(1);
  });

  it('una corrección manual de fecha se aplica y deja de ser excepción', () => {
    const filas = [20, 21, 22, 23, 24].map((n) => serie(n, dia(3)));
    filas.push(serie(25, new Date(Date.UTC(2026, 2, 8))));
    filas.push(...[26, 27, 28, 29, 30].map((n) => serie(n, dia(3))));
    const r = limpiar(filas, {
      correcciones: [
        { comprobante: '26-0025', columna: 'fecha', valor: '03/08/2026' },
      ],
    });
    expect(
      r.excepciones.filter((x) => x.tipo === 'fecha-fuera-de-secuencia'),
    ).toHaveLength(0);
    expect(
      r.filas
        .find((f) => f.codigo === '26-0025')!
        .fecha.toISOString()
        .slice(0, 10),
    ).toBe('2026-08-03');
    expect(
      r.cambios.find((c) => c.regla === 'correccion-manual'),
    ).toMatchObject({ comprobante: '26-0025.1', nuevo: '03/08/2026' });
  });

  it('una corrección que no apunta a ninguna fila se avisa', () => {
    const r = limpiar([fila(1)], {
      correcciones: [
        { comprobante: '26-9999', columna: 'fecha', valor: '01/01/2026' },
      ],
    });
    expect(
      r.excepciones.find((e) => e.tipo === 'correccion-sin-fila'),
    ).toBeDefined();
  });
});

describe('limpiarMaestra — filas incompletas y anuladas', () => {
  it('las filas sin tipo de gasto, centro o estado no van a la fuente limpia', () => {
    const r = limpiar([
      fila(1),
      fila(2, {
        tipoGasto: null,
        centroCosto: null,
        estadoRendicion: null,
        detalle: null,
      }),
    ]);
    expect(r.filas).toHaveLength(1);
    expect(r.exclusiones[0]).toMatchObject({ motivo: 'incompleta' });
    expect(r.exclusiones[0].detalle).toContain('TIPO DE GASTO');
    expect(r.exclusiones[0].detalle).toContain('CENTRO DE COSTO');
  });

  it('un comprobante ANULADA se excluye', () => {
    const r = limpiar([fila(1, { tipoOperacion: 'ANULADA' })]);
    expect(r.filas).toHaveLength(0);
    expect(r.exclusiones[0].motivo).toBe('anulada');
  });

  it('un importe cero o ilegible se excluye con motivo', () => {
    const r = limpiar([
      fila(1, { importe: 0 }),
      fila(2, { importe: 'S/ abc' }),
    ]);
    expect(r.exclusiones.map((e) => e.motivo)).toEqual([
      'importe-invalido',
      'importe-invalido',
    ]);
  });
});

describe('limpiarMaestra — catálogos', () => {
  it('corrige el responsable al del catálogo (SANCHES → SANCHEZ) y lo registra', () => {
    const r = limpiar([fila(1, { responsable: 'DANIEL SANCHES FERNANDEZ' })]);
    expect(r.filas[0].responsable).toBe('DANIEL SANCHEZ FERNANDEZ');
    expect(r.cambios[0]).toMatchObject({
      regla: 'responsable-catalogo',
      original: 'DANIEL SANCHES FERNANDEZ',
    });
  });

  it('reconoce el mismo responsable con las palabras en otro orden', () => {
    const r = limpiar([fila(1, { responsable: 'Carlos Luis Palma Mendoza' })]);
    expect(r.filas[0].responsable).toBe('PALMA MENDOZA CARLOS LUIS');
  });

  it('un responsable que no está en el catálogo se carga igual, como información', () => {
    const r = limpiar([
      fila(1, { responsable: 'AMAYA AGUILAR JUNIOR ARTURO' }),
    ]);
    expect(r.filas[0].responsable).toBe('AMAYA AGUILAR JUNIOR ARTURO');
    expect(r.excepciones[0]).toMatchObject({
      tipo: 'responsable-fuera-de-catalogo',
      severidad: 'info',
    });
  });

  it('toma la cuenta del proveedor del catálogo (texto) y NO APLICA queda en 0', () => {
    const r = limpiar([
      fila(1, {
        proveedor: 'QUISPE CAJUSOL EFRAIN',
        cuentaProveedor: 30577202293,
      }),
      fila(2, { proveedor: 'NO APLICA', cuentaProveedor: '' }),
    ]);
    expect(r.filas[0].cuentaProveedor).toBe('30577202293');
    expect(r.filas[1].cuentaProveedor).toBe('0');
  });

  it('un proveedor con dos cuentas en el catálogo conserva la de la fila y lo avisa', () => {
    const r = limpiar([
      fila(1, { proveedor: 'AMSEQ 3A', cuentaProveedor: '3052300140045' }),
    ]);
    expect(r.filas[0].cuentaProveedor).toBe('3052300140045');
    expect(r.excepciones[0]).toMatchObject({
      tipo: 'proveedor-cuentas-ambiguas',
    });
  });

  it('completa la descripción del centro de costo cuando la fórmula del Excel la dejó vacía', () => {
    const r = limpiar([
      fila(1, { centroCosto: '024-ING-26', descCentroCosto: null }),
    ]);
    expect(r.filas[0].descCentroCosto).toBe('CERRAMIENTO ENTEL');
    expect(r.cambios[0]).toMatchObject({
      regla: 'descripcion-centro',
      nuevo: 'CERRAMIENTO ENTEL',
    });
  });

  it('sin hoja DATOS limpia igual, solo sin validar', () => {
    const r = limpiar([fila(1, { responsable: 'ALGUIEN SIN CATALOGO' })], {
      catalogos: null,
    });
    expect(r.filas).toHaveLength(1);
    expect(r.excepciones).toHaveLength(0);
  });
});

describe('limpiarMaestra — centros de costo', () => {
  it('propone obra con el código sin espacios y administración para gastos de la empresa', () => {
    expect(proponerDecision('017- ING-26', 'TIENDA')).toMatchObject({
      accion: 'obra',
      codigoSistema: '017-ING-26',
    });
    expect(proponerDecision('OFICINA CHICLAYO', 'GASTOS')).toMatchObject({
      accion: 'administracion',
      codigoSistema: 'ADMINISTRACION',
    });
    expect(proponerDecision('GERENCIA', '')).toMatchObject({
      accion: 'administracion',
    });
    expect(proponerDecision('00-ING-LIC', 'LICITACIONES').notas).toMatch(
      /Confirmar/,
    );
    // 01-ING-26 y 001-ING-26 son obras distintas: no se rellenan ceros
    expect(proponerDecision('01-ING-26', 'x').codigoSistema).toBe('01-ING-26');
  });

  it('los gastos de administración salen con ADMINISTRACION y conservan el centro original en la observación', () => {
    const r = limpiar([
      fila(1, {
        centroCosto: 'OFICINA CHICLAYO',
        descCentroCosto: 'GASTOS DIVERSOS DE LA EMPRESA',
      }),
    ]);
    expect(r.filas[0]).toMatchObject({
      centroCosto: 'ADMINISTRACION',
      nota: 'Centro de costo (Excel): OFICINA CHICLAYO - GASTOS DIVERSOS DE LA EMPRESA',
    });
  });

  it('respeta la decisión tomada para un centro (código distinto en el sistema)', () => {
    const decision: DecisionCentro = {
      codigoExcel: '017- ING-26',
      accion: 'obra',
      codigoSistema: 'ADIDAS-MALL',
      nombre: 'Tienda Adidas Mall',
      notas: '',
    };
    const r = limpiar([fila(1, { centroCosto: '017- ING-26' })], {
      decisiones: new Map([['017-ING-26', decision]]),
    });
    expect(r.filas[0]).toMatchObject({
      centroCosto: 'ADIDAS-MALL',
      descCentroCosto: 'Tienda Adidas Mall',
    });
    expect(r.centros[0].propuestaNueva).toBe(false);
  });

  it('resume cada centro con filas, importe y fechas', () => {
    const r = limpiar([
      fila(1),
      fila(2),
      fila(3, { centroCosto: 'OFICINA CHICLAYO' }),
    ]);
    const obra = r.centros.find((c) => c.codigoExcel === '022-ING-26')!;
    expect(obra).toMatchObject({
      filas: 2,
      importe: 101 + 102,
      propuestaNueva: true,
    });
    expect(r.decisiones.size).toBe(2);
  });
});

describe('limpiarMaestra — rango y control', () => {
  it('limita por correlativo y no reporta lo que queda fuera del rango', () => {
    const r = limpiar(
      [
        fila(10),
        fila(11, { importe: 'S/ abc' }),
        fila(20),
        fila(21, { tipoGasto: null, detalle: null }),
      ],
      { hastaCorrelativo: 12 },
    );
    expect(r.filas.map((f) => f.codigo)).toEqual(['26-0010']);
    expect(r.exclusiones.map((e) => e.comprobante)).toEqual(['26-0011.1']);
    expect(r.exclusiones.some((e) => e.comprobante === '26-0021.1')).toBe(
      false,
    );
    expect(r.conteos.fueraDeRango).toBe(1);
  });

  it('limita también por fechas', () => {
    const r = limpiar(
      [
        fila(10, { fecha: new Date(Date.UTC(2026, 0, 5)) }),
        fila(11, { fecha: new Date(Date.UTC(2026, 5, 5)) }),
      ],
      { desde: new Date(Date.UTC(2026, 3, 1)) },
    );
    expect(r.filas.map((f) => f.codigo)).toEqual(['26-0011']);
  });

  it('calcula el control por mes y por tipo de gasto (para conciliar luego)', () => {
    const r = limpiar([
      fila(1, { fecha: new Date(Date.UTC(2026, 0, 5)), importe: 100.5 }),
      fila(2, { fecha: new Date(Date.UTC(2026, 0, 6)), importe: 50.25 }),
      fila(3, {
        fecha: new Date(Date.UTC(2026, 1, 1)),
        importe: 10,
        tipoGasto: 'POLIZAS',
      }),
    ]);
    expect(r.control).toMatchObject({ filas: 3, importe: 160.75 });
    expect(r.control.porMes).toEqual([
      { mes: '2026-01', filas: 2, importe: 150.75 },
      { mes: '2026-02', filas: 1, importe: 10 },
    ]);
    expect(r.control.porTipoGasto.map((t) => t.tipoGasto)).toEqual([
      'POLIZAS',
      'VIATICOS',
    ]);
  });

  it('informa las rendiciones inconsistentes sin bloquear la carga', () => {
    const r = limpiar([
      fila(1, { importe: 100, importeRendido: 120 }),
      fila(2, { importe: 100, importeRendido: 90 }),
      fila(3, {
        estadoRendicion: 'ABIERTO',
        importe: 100,
        importeRendido: 100,
      }),
      fila(4, { importeRendido: null }),
    ]);
    expect(r.filas).toHaveLength(4);
    expect(
      r.excepciones.filter((e) => e.tipo === 'rendicion-inconsistente'),
    ).toHaveLength(4);
    expect(r.excepciones.every((e) => e.severidad === 'info')).toBe(true);
  });

  it('los conteos de cambios y espacios son solo del rango pedido', () => {
    const filas = [
      fila(10, { fecha: ' 05/01/2026', detalle: '  con espacios  ' }),
      fila(20, { fecha: ' 06/01/2026', detalle: '  otro  ' }),
    ];
    const todo = limpiar(filas);
    expect(todo.conteos).toMatchObject({
      fechasEnTexto: 2,
      celdasConEspacios: expect.any(Number),
    });
    const parte = limpiar(filas, { hastaCorrelativo: 12 });
    expect(parte.conteos.fechasEnTexto).toBe(1);
    expect(parte.conteos.cambiosPorRegla).toEqual({ 'fecha-texto': 1 });
    expect(parte.conteos.celdasConEspacios).toBeLessThan(
      todo.conteos.celdasConEspacios,
    );
  });

  it('parseCorrelativo acepta 26-1828 y 261828, y rechaza números cortos ambiguos', () => {
    expect(parseCorrelativo('26-1828')).toBe(1828);
    expect(parseCorrelativo('261828')).toBe(1828);
    expect(parseCorrelativo('26-0001')).toBe(1);
    expect(() => parseCorrelativo('1828')).toThrow(/ambiguo/);
    expect(() => parseCorrelativo('abc')).toThrow(/No entiendo/);
  });
});

describe('coincidencia de nombres', () => {
  const catalogo = [
    'DANIEL SANCHEZ FERNANDEZ',
    'PALMA MENDOZA CARLOS LUIS',
    'PALMA MENDOZA CARLOS LUIS ALBERTO',
  ];

  it('levenshtein cuenta ediciones', () => {
    expect(levenshtein('SANCHES', 'SANCHEZ')).toBe(1);
    expect(levenshtein('', 'ABC')).toBe(3);
    expect(levenshtein('IGUAL', 'IGUAL')).toBe(0);
  });

  it('exacto, mismo conjunto de palabras y aproximado', () => {
    expect(
      buscarEnCatalogo('daniel sanchez fernandez', catalogo, 2),
    ).toMatchObject({ tipo: 'exacto' });
    expect(
      buscarEnCatalogo('Luis Carlos Palma Mendoza', catalogo, 2),
    ).toMatchObject({ tipo: 'orden', valor: 'PALMA MENDOZA CARLOS LUIS' });
    expect(
      buscarEnCatalogo('DANIEL SANCHES FERNANDEZ', catalogo, 2),
    ).toMatchObject({
      tipo: 'aproximado',
      valor: 'DANIEL SANCHEZ FERNANDEZ',
      distancia: 1,
    });
  });

  it('no inventa coincidencias: nombres distintos o cortos quedan sin resolver', () => {
    expect(
      buscarEnCatalogo('AMAYA AGUILAR JUNIOR ARTURO', catalogo, 2),
    ).toEqual({ tipo: 'ninguno' });
    expect(buscarEnCatalogo('ANA PAZ', ['ANA PAS'], 2)).toEqual({
      tipo: 'ninguno',
    });
  });

  it('con dos candidatos igual de cerca no decide', () => {
    const r = buscarEnCatalogo(
      'CARLOS MENDOZA PEREZ LOPEZ',
      ['CARLOS MENDOZA PEREZ LOPES', 'CARLOS MENDOZA PEREZ LOPEX'],
      2,
    );
    expect(r.tipo).toBe('ambiguo');
  });
});
