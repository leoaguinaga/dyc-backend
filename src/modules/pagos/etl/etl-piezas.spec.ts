import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { leerCatalogos } from './catalogos.js';
import { construirDecisiones, leerDecisiones } from './decisiones.js';
import { proponerDecision } from './limpiador.js';
import type { DecisionCentro, Excepcion, ResumenCentro } from './limpiador.js';
import { compararPago } from './verificacion.js';
import type { DatosPago } from '../importacion/importacion.service.js';

let carpeta: string;
beforeAll(() => {
  carpeta = mkdtempSync(path.join(tmpdir(), 'etl-pagos-'));
});
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

describe('leerCatalogos', () => {
  async function libroDatos() {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('DATOS');
    // Misma disposición que el Excel de tesorería: rótulos en la fila 2, listas lado a lado.
    hoja.getRow(2).values = [
      'TIPO DE OPERACIÓN',
      undefined,
      'BANCO',
      'N° CUENTA',
      undefined,
      'GRUPO',
      'TIPO DE GASTO',
      'DESCRIPCIÓN',
      undefined,
      'RESPONSABLE DE LA RENDICION',
      undefined,
      'PROVEEDORES',
      'NUMERO DE CUENTA',
      undefined,
      'CENTRO DE COSTO',
      'DESCRIPCIÓN DEL CENTRO DE COSTOS',
      undefined,
      'RAZON SOCIAL',
      'RUC',
    ];
    const filas: Record<number, unknown[]> = {
      3: [
        'ANULADA',
        undefined,
        'BCP',
        '305-1',
        undefined,
        'COMPRAS',
        'COMPRA DE MATERIALES',
        undefined,
        undefined,
        'RESPONSABLE DE LA RENDICION',
        undefined,
        'AMSEQ 3A',
        '3052300140045',
        undefined,
        '12-ING-25',
        'PUCALLPA',
        undefined,
        'DYC SAC',
        '20479502367',
      ],
      4: [
        'CHEQUE',
        undefined,
        'BCP-2',
        '194-2',
        undefined,
        'COMPRAS',
        'VIATICOS',
        undefined,
        undefined,
        'ADMINISTRACION',
        undefined,
        'AMSEQ 3A',
        'CUENTA RECAUDADORA',
        undefined,
        '017- ING-26',
        'ADIDAS MALL',
        undefined,
        'D&C SAC',
        '20608745611',
      ],
      5: [
        'TRANSFERENCIA',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'VIATICOS',
        undefined,
        undefined,
        'DANIEL SANCHEZ FERNANDEZ',
        undefined,
        'QUISPE EFRAIN',
        1133800020033040000,
        undefined,
        '017- ING-26',
        'REPETIDO',
      ],
    };
    for (const [n, valores] of Object.entries(filas))
      hoja.getRow(Number(n)).values = valores as ExcelJS.CellValue[];
    const ruta = path.join(carpeta, 'datos.xlsx');
    await libro.xlsx.writeFile(ruta);
    return ruta;
  }

  it('lee centros, proveedores con cuentas, tipos de gasto, responsables, empresas y operaciones', async () => {
    const c = (await leerCatalogos(await libroDatos()))!;
    expect(c.centros).toEqual([
      { codigo: '12-ING-25', descripcion: 'PUCALLPA' },
      { codigo: '017- ING-26', descripcion: 'ADIDAS MALL' },
    ]);
    expect(c.proveedores.find((p) => p.nombre === 'AMSEQ 3A')?.cuentas).toEqual(
      ['3052300140045', 'CUENTA RECAUDADORA'],
    );
    expect(c.tiposGasto).toEqual(['COMPRA DE MATERIALES', 'VIATICOS']);
    expect(c.responsables).toEqual([
      'ADMINISTRACION',
      'DANIEL SANCHEZ FERNANDEZ',
    ]);
    expect(c.empresas).toEqual([
      { razonSocial: 'DYC SAC', ruc: '20479502367' },
      { razonSocial: 'D&C SAC', ruc: '20608745611' },
    ]);
    expect(c.tiposOperacion).toEqual(['ANULADA', 'CHEQUE', 'TRANSFERENCIA']);
  });

  it('una cuenta numérica larga se lee como texto sin notación científica', async () => {
    const c = (await leerCatalogos(await libroDatos()))!;
    const cuenta = c.proveedores.find((p) => p.nombre === 'QUISPE EFRAIN')!
      .cuentas[0];
    expect(cuenta).toMatch(/^\d+$/);
    expect(cuenta.length).toBeGreaterThanOrEqual(18);
  });

  it('un libro sin hoja DATOS devuelve null', async () => {
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet('OTRA');
    const ruta = path.join(carpeta, 'sin-datos.xlsx');
    await libro.xlsx.writeFile(ruta);
    expect(await leerCatalogos(ruta)).toBeNull();
  });
});

describe('archivo de decisiones', () => {
  const resumen = (
    codigoExcel: string,
    decision: DecisionCentro,
    propuestaNueva: boolean,
  ): ResumenCentro => ({
    codigoExcel,
    descripcion: decision.nombre,
    filas: 10,
    importe: 1234.5,
    primerPago: new Date(Date.UTC(2026, 0, 5)),
    ultimoPago: new Date(Date.UTC(2026, 8, 1)),
    decision,
    propuestaNueva,
  });

  it('se escribe y se vuelve a leer sin perder lo que el usuario decidió', async () => {
    const obra = proponerDecision('017- ING-26', 'ADIDAS MALL');
    const oficina = proponerDecision('OFICINA CHICLAYO', 'GASTOS');
    const decisiones = new Map([
      ['017-ING-26', obra],
      ['OFICINACHICLAYO', oficina],
    ]);
    const excepciones: Excepcion[] = [
      {
        fila: 9,
        comprobante: '26-0025.1',
        tipo: 'fecha-fuera-de-secuencia',
        severidad: 'revisar',
        detalle: 'Fecha 08/03/2026',
        sugerencia: 'Confirma',
        columna: 'fecha',
      },
    ];
    const libro = construirDecisiones({
      centros: [
        resumen('017- ING-26', obra, true),
        resumen('OFICINA CHICLAYO', oficina, true),
      ],
      decisiones,
      correcciones: [
        { comprobante: '26-0010', columna: 'importe', valor: '120.50' },
      ],
      excepciones,
      existentes: new Set(['017-ING-26']),
      activaDesde: new Date(Date.UTC(2026, 7, 1)),
    });
    const ruta = path.join(carpeta, 'decisiones.xlsx');
    await libro.xlsx.writeFile(ruta);

    const leidas = await leerDecisiones(ruta);
    expect(leidas.centros.get('017-ING-26')).toMatchObject({
      accion: 'obra',
      codigoSistema: '017-ING-26',
      nombre: 'ADIDAS MALL',
    });
    expect(leidas.centros.get('OFICINACHICLAYO')).toMatchObject({
      accion: 'administracion',
      codigoSistema: 'ADMINISTRACION',
    });
    // La fila sugerida (sin valor) se ignora; la decidida se conserva.
    expect(leidas.correcciones).toEqual([
      { comprobante: '26-0010', columna: 'importe', valor: '120.50' },
    ]);
  });

  it('una acción inválida o una obra sin código de sistema se rechazan con la fila', async () => {
    const malo = async (accion: string, codigoSistema: string) => {
      const libro = new ExcelJS.Workbook();
      const hoja = libro.addWorksheet('Centros de costo');
      hoja.addRow([
        'CÓDIGO EN EL EXCEL',
        'DESCRIPCIÓN',
        'ACCIÓN',
        'CÓDIGO EN EL SISTEMA',
        'NOMBRE DE LA OBRA',
        'NOTAS',
      ]);
      hoja.addRow(['017- ING-26', 'x', accion, codigoSistema, 'x', '']);
      const ruta = path.join(carpeta, `malo-${accion}-${codigoSistema}.xlsx`);
      await libro.xlsx.writeFile(ruta);
      return leerDecisiones(ruta);
    };
    await expect(malo('quizas', 'X')).rejects.toThrow(
      /fila 2.*obra o administracion/,
    );
    await expect(malo('obra', '')).rejects.toThrow(
      /fila 2.*falta el CÓDIGO EN EL SISTEMA/,
    );
  });

  it('sin archivo no hay decisiones', async () => {
    const r = await leerDecisiones(path.join(carpeta, 'no-existe.xlsx'));
    expect(r.centros.size).toBe(0);
    expect(r.correcciones).toEqual([]);
  });
});

describe('compararPago', () => {
  const datos = (extra: Partial<DatosPago> = {}): DatosPago => ({
    codigoComprobante: '26-0001',
    subNumero: 1,
    fecha: new Date(Date.UTC(2026, 0, 5)),
    monto: 100,
    metodoPago: 'Transferencia',
    categoria: 'VIATICOS',
    concepto: 'GASTO',
    centroCosto: 'obra',
    proyecto: {
      id: 'p',
      codigo: '017-ING-26',
      nuevo: false,
      nombreNuevo: null,
    },
    tipoBeneficiario: 'proveedor',
    beneficiarioNombre: 'QUISPE EFRAIN',
    beneficiarioTrabajadorId: null,
    numeroCuenta: '3057-72',
    empresaRuc: '20608745611',
    cuentaOrigen: { banco: 'BCP', numero: '305-98401930-95' },
    responsableNombre: 'ADMINISTRACION',
    responsableTrabajadorId: null,
    importeRendido: 100,
    estadoRendicion: 'cerrado',
    generadoPorNombre: 'JESSICA',
    generadoPorUserId: null,
    nota: null,
    ...extra,
  });
  const pago = (extra: Record<string, unknown> = {}) => ({
    id: 'x',
    codigoComprobante: '26-0001',
    subNumero: 1,
    importacionId: 'lote',
    estado: 'pagado',
    monto: { toString: () => '100' },
    fechaPagoReal: new Date(Date.UTC(2026, 0, 5)),
    metodoPago: 'Transferencia',
    categoria: 'VIATICOS',
    concepto: 'GASTO',
    centroCosto: 'obra',
    proyecto: { codigo: '017- ING-26' },
    beneficiarioNombre: 'Quispe Efrain',
    numeroCuenta: '305772',
    empresa: { ruc: '20608745611' },
    cuentaOrigen: { numero: '30598401930 95' },
    responsableRendicionNombre: 'administracion',
    importeRendido: { toString: () => '100.00' },
    estadoRendicion: 'cerrado',
    nota: null,
    ...extra,
  });

  it('un pago idéntico no tiene diferencias, aunque cambien mayúsculas, espacios o formato de cuentas', () => {
    expect(compararPago('26-0001.1', datos(), pago() as never)).toEqual([]);
  });

  it('administración: sin obra en el sistema equivale a ADMINISTRACION', () => {
    const d = datos({
      centroCosto: 'administracion',
      proyecto: { id: null, codigo: null, nuevo: false, nombreNuevo: null },
    });
    expect(
      compararPago(
        '26-0001.1',
        d,
        pago({ proyecto: null, centroCosto: 'administracion' }) as never,
      ),
    ).toEqual([]);
  });

  it('señala cada campo que no coincide, con esperado y real', () => {
    const dif = compararPago(
      '26-0001.1',
      datos(),
      pago({
        monto: { toString: () => '101' },
        categoria: 'POLIZAS',
        fechaPagoReal: new Date(Date.UTC(2026, 1, 5)),
        estadoRendicion: 'abierto',
      }),
    );
    expect(dif.map((d) => d.campo).sort()).toEqual([
      'estado de la rendición',
      'fecha de pago',
      'importe',
      'tipo de gasto',
    ]);
    expect(dif.find((d) => d.campo === 'importe')).toMatchObject({
      esperado: '100',
      enSistema: '101',
      creadoPorCarga: true,
    });
  });

  it('distingue los pagos creados por la carga de los que ya existían y se enlazaron', () => {
    const dif = compararPago(
      '26-0001.1',
      datos(),
      pago({ importacionId: null, monto: { toString: () => '99' } }),
    );
    expect(dif[0].creadoPorCarga).toBe(false);
  });
});
