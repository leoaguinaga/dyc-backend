import ExcelJS from 'exceljs';
import type { ResultadoReporte } from './reportes-query.service.js';

export async function construirWorkbookReporte(resultado: ResultadoReporte): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Reporte');

  sheet.columns = resultado.columnas.map((columna) => ({
    header: columna.label,
    key: columna.key,
    width: Math.max(columna.label.length + 2, 14),
  }));

  sheet.getRow(1).font = { bold: true };

  for (const fila of resultado.filas) {
    sheet.addRow(fila);
  }

  return workbook.xlsx.writeBuffer();
}
