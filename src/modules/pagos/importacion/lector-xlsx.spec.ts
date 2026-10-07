import ExcelJS from 'exceljs';
import { COLUMNAS } from './columnas.js';
import { leerXlsx } from './lector-xlsx.js';

async function libroComo(hojas: Record<string, unknown[][]>): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const hoja = libro.addWorksheet(nombre);
    for (const fila of filas) hoja.addRow(fila);
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const ENCABEZADOS = COLUMNAS.map((c) => c.encabezado);

describe('leerXlsx', () => {
  it('encuentra el encabezado debajo de un título y lee los valores crudos', async () => {
    const buffer = await libroComo({
      Pagos: [
        ['CONTROL DE PAGOS'],
        [],
        ENCABEZADOS,
        [
          '262248,1',
          '262248',
          '25/09/2026',
          'S/180,00',
          'TRANSFERENCIA',
          'BCP-D&C',
          '305-98401930-95',
          'VIATICOS',
          'HOSPEDAJE',
          'PALMA',
          'NO APLICA',
          0,
          '022-ING-26',
          'VIDEO WALL',
          'S/180,00',
          'JESSICA',
          'CERRADO',
          'D&C SAC',
          '20608745611',
        ],
        [],
        [
          '262249,1',
          '262249',
          new Date(Date.UTC(2026, 8, 25)),
          300,
          'TRANSFERENCIA',
        ],
      ],
    });
    const lectura = await leerXlsx(buffer);

    expect(lectura.hoja).toBe('Pagos');
    expect(lectura.filas.map((f) => f.fila)).toEqual([4, 6]);
    expect(lectura.filas[0].valores).toMatchObject({
      subComprobante: '262248,1',
      comprobante: '262248',
      importe: 'S/180,00',
      centroCosto: '022-ING-26',
      estadoRendicion: 'CERRADO',
      ruc: '20608745611',
    });
    expect(lectura.filas[1].valores.fecha).toBeInstanceOf(Date);
    expect(lectura.filas[1].valores.importe).toBe(300);
  });

  it('reconoce columnas por nombre aunque cambien de orden, acentos o mayúsculas', async () => {
    const buffer = await libroComo({
      Pagos: [
        [
          'importe',
          'fecha de operación',
          'Nº Comprobante',
          'centro de costo',
          'Tipo de gasto',
          'proveedor',
          'detalle del gasto',
        ],
        [
          50,
          '01/10/2026',
          '262300',
          '022-ING-26',
          'viaticos',
          'NO APLICA',
          'movilidad',
        ],
      ],
    });
    const { filas, columnasOpcionalesAusentes } = await leerXlsx(buffer);
    expect(filas[0].valores).toMatchObject({
      importe: 50,
      comprobante: '262300',
      centroCosto: '022-ING-26',
    });
    expect(columnasOpcionalesAusentes).toContain('BANCO');
  });

  it('prefiere la hoja "Pagos" sobre otras con encabezados', async () => {
    const buffer = await libroComo({
      Ejemplo: [
        ENCABEZADOS,
        [
          '269901,1',
          '269901',
          '25/09/2026',
          1,
          'X',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '000-ING-26',
        ],
      ],
      Pagos: [
        ENCABEZADOS,
        [
          '262248,1',
          '262248',
          '25/09/2026',
          2,
          'X',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '022-ING-26',
        ],
      ],
    });
    const { hoja, filas } = await leerXlsx(buffer);
    expect(hoja).toBe('Pagos');
    expect(filas[0].valores.centroCosto).toBe('022-ING-26');
  });

  it('lee el resultado de fórmulas y texto enriquecido', async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Pagos');
    hoja.addRow(ENCABEZADOS);
    const fila = hoja.addRow([]);
    fila.getCell(2).value = '262248';
    fila.getCell(3).value = '25/09/2026';
    fila.getCell(4).value = { formula: '100+80', result: 180 };
    fila.getCell(13).value = {
      richText: [{ text: '022-' }, { text: 'ING-26' }],
    };
    const { filas } = await leerXlsx(
      Buffer.from(await libro.xlsx.writeBuffer()),
    );
    expect(filas[0].valores.importe).toBe(180);
    expect(filas[0].valores.centroCosto).toBe('022-ING-26');
  });

  it('explica qué columnas obligatorias faltan', async () => {
    const buffer = await libroComo({
      Pagos: [
        [
          'Nº COMPROBANTE',
          'FECHA DE OPERACION',
          'IMPORTE',
          'BANCO',
          'CUENTA',
          'TIPO DE GASTO',
        ],
        ['262248', '25/09/2026', 10, 'BCP', '1', 'X'],
      ],
    });
    await expect(leerXlsx(buffer)).rejects.toThrow(
      /Faltan columnas obligatorias.*CENTRO DE COSTO/,
    );
  });

  it('falla con un mensaje claro si no hay encabezados reconocibles', async () => {
    const buffer = await libroComo({
      Hoja1: [
        ['a', 'b'],
        [1, 2],
      ],
    });
    await expect(leerXlsx(buffer)).rejects.toThrow(
      /No encontré la fila de encabezados/,
    );
  });

  it('un libro con catálogos (DATOS) no se confunde con la lista de pagos', async () => {
    const buffer = await libroComo({
      DATOS: [
        [
          'TIPO DE OPERACIÓN',
          'BANCO',
          'TIPO DE GASTO',
          'RESPONSABLE DE LA RENDICION',
          'CENTRO DE COSTO',
          'ABIERTO / CERRADO',
        ],
        ['TRANSFERENCIA', 'BCP', 'VIATICOS', 'X', '022-ING-26', 'ABIERTO'],
      ],
      'LISTA MAESTRA': [
        ['LOGO'],
        ENCABEZADOS,
        [
          '2601.1',
          '2601',
          '05/01/2026',
          10,
          'TRANSFERENCIA',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '022-ING-26',
        ],
      ],
    });
    const { hoja, filas } = await leerXlsx(buffer);
    expect(hoja).toBe('LISTA MAESTRA');
    expect(filas[0].valores.comprobante).toBe('2601');
  });

  it('permite elegir la hoja y avisa cuál no existe', async () => {
    const buffer = await libroComo({
      A: [
        ENCABEZADOS,
        [
          '1.1',
          '1',
          '05/01/2026',
          1,
          'X',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '000-ING-26',
        ],
      ],
      B: [
        ENCABEZADOS,
        [
          '2.1',
          '2',
          '06/01/2026',
          2,
          'X',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '111-ING-26',
        ],
      ],
    });
    expect(
      (await leerXlsx(buffer, { hoja: 'b' })).filas[0].valores.centroCosto,
    ).toBe('111-ING-26');
    await expect(leerXlsx(buffer, { hoja: 'Z' })).rejects.toThrow(
      /No existe la hoja "Z".*"A", "B"/,
    );
  });
});
