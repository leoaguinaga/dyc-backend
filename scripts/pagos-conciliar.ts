import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  conciliar,
  construirConciliacion,
} from '../src/modules/pagos/etl/conciliacion.js';
import { PagosImportService } from '../src/modules/pagos/importacion/importacion.service.js';
import { leerXlsx } from '../src/modules/pagos/importacion/lector-xlsx.js';
import { crearPrisma, describirBd, parseFechaArg, soles } from './pagos-cli.js';

const AYUDA = `
Concilia el Excel de tesorería (fuente limpia) contra la base y dice qué pagos faltan
registrar. Solo lee; no modifica nada.

  pnpm pagos:conciliar <fuente-limpia.xlsx> [opciones]

  --desde AAAA-MM-DD     Solo filas con fecha de operación desde ese día
  --hasta AAAA-MM-DD     Solo filas con fecha de operación hasta ese día
  --ventana-pagado N     Días de tolerancia contra pagos ya pagados (por defecto 3)
  --ventana-pendiente N  Días de tolerancia contra pagos pendientes (por defecto 30)
  --reporte <ruta.xlsx>  Dónde guardar el detalle (por defecto junto al archivo)

Para producir la fuente limpia desde el Excel crudo: pnpm pagos:limpiar (ver docs/carga-de-pagos.md).
Para registrar lo que falta: pnpm pagos:importar <fuente-limpia.xlsx> --vincular --aplicar --usuario <email>
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      desde: { type: 'string' },
      hasta: { type: 'string' },
      'ventana-pagado': { type: 'string' },
      'ventana-pendiente': { type: 'string' },
      reporte: { type: 'string' },
      ayuda: { type: 'boolean', default: false },
    },
  });
  const archivo = positionals[0];
  if (values.ayuda || !archivo) {
    console.log(AYUDA);
    process.exit(archivo ? 0 : 1);
  }

  const prisma = crearPrisma();
  try {
    console.log(`Base de datos: ${describirBd()} (solo lectura)`);
    const lectura = await leerXlsx(archivo);
    const plan = await new PagosImportService(prisma).planificar(
      lectura.filas,
      path.basename(archivo),
      {
        vincular: true,
        desde: parseFechaArg(values.desde, '--desde'),
        hasta: parseFechaArg(values.hasta, '--hasta'),
        ventanaDiasPagado: values['ventana-pagado']
          ? Number(values['ventana-pagado'])
          : undefined,
        ventanaDiasPendiente: values['ventana-pendiente']
          ? Number(values['ventana-pendiente'])
          : undefined,
      },
    );
    const r = await conciliar(prisma, plan);
    const ruta =
      values.reporte ?? archivo.replace(/\.xlsx?$/i, '') + '.conciliacion.xlsx';
    await construirConciliacion(r, path.basename(archivo)).xlsx.writeFile(ruta);

    console.log('\n──────── Conciliación ────────');
    console.log(
      `Faltan registrar:                ${r.faltan.length}  (S/ ${soles(r.montoFaltante)})`,
    );
    console.log(
      `Ya registrados sin código:       ${r.enlazables.length}  (${r.enlazables.filter((e) => e.pago?.estado === 'pendiente').length} hoy pendientes → pasarían a pagado)`,
    );
    console.log(`Dudosos (revisar a mano):        ${r.dudosas.length}`);
    console.log(`Ya cargados con comprobante:     ${r.yaCargadas}`);
    console.log(`Con error en el Excel:           ${r.conError.length}`);
    console.log(`Sistema sin fila en el Excel:    ${r.sistemaSinExcel.length}`);
    console.log(`\nDetalle: ${ruta}`);
    process.exit(0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n❌  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
