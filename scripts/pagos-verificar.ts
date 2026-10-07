import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  construirVerificacion,
  verificarCarga,
} from '../src/modules/pagos/etl/verificacion.js';
import { PagosImportService } from '../src/modules/pagos/importacion/importacion.service.js';
import { leerXlsx } from '../src/modules/pagos/importacion/lector-xlsx.js';
import { crearPrisma, describirBd, soles } from './pagos-cli.js';

const AYUDA = `
Verifica una carga ya hecha: compara la fuente limpia contra la base, fila por fila y
campo por campo, cuadra los importes por mes y lista los pagos del sistema que no
tienen fila en el Excel. Solo lee; no modifica nada.

  pnpm pagos:verificar <fuente-limpia.xlsx> [opciones]

  --reporte <ruta.xlsx>   Dónde guardar el detalle (por defecto junto al archivo)
  --estricto              También falla si hay pagos del sistema sin fila en el Excel

Sale con código 0 solo si no falta ninguna fila, no hay diferencias en los pagos creados
por la carga y cada mes cuadra al centavo.
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      reporte: { type: 'string' },
      estricto: { type: 'boolean', default: false },
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
    console.log(`Archivo:       ${archivo}`);
    const lectura = await leerXlsx(archivo);
    const plan = await new PagosImportService(prisma).planificar(
      lectura.filas,
      path.basename(archivo),
      {},
    );
    const r = await verificarCarga(prisma, plan);

    const rutaReporte =
      values.reporte ?? archivo.replace(/\.xlsx?$/i, '') + '.verificacion.xlsx';
    await construirVerificacion(r, path.basename(archivo)).xlsx.writeFile(
      rutaReporte,
    );

    console.log('\n──────── Verificación ────────');
    console.log(
      `Filas en la fuente:                 ${r.filasArchivo}${r.filasNoVerificables.length ? `  (${r.filasNoVerificables.length} no verificables)` : ''}`,
    );
    console.log(`Encontradas en el sistema:          ${r.encontradas}`);
    console.log(`Faltan en el sistema:               ${r.faltantes.length}`);
    console.log(`Diferencias en pagos de la carga:   ${r.diferenciasDeCarga}`);
    console.log(
      `Diferencias en pagos enlazados:     ${r.diferencias.length - r.diferenciasDeCarga}`,
    );
    console.log(`Pagos del sistema sin fila:         ${r.sinFila.length}`);
    console.log('\nControl por mes (archivo vs sistema):');
    for (const m of r.porMes) {
      const ok = m.diferencia === 0 && m.filasArchivo === m.filasSistema;
      console.log(
        `  ${m.mes}  ${String(m.filasArchivo).padStart(4)} filas  S/ ${soles(m.importeArchivo).padStart(13)}  |  ${String(m.filasSistema).padStart(4)} filas  S/ ${soles(m.importeSistema).padStart(13)}  ${ok ? '✔' : `✘ diferencia S/ ${soles(m.diferencia)}`}`,
      );
    }
    console.log(
      `\nComprobantes: mayor en el archivo ${r.correlativo.maximoArchivo ?? '—'}, mayor en el sistema ${r.correlativo.maximoSistema ?? '—'}, el sistema asignará ${r.correlativo.siguienteSistema ?? '—'}`,
    );
    console.log(`Detalle: ${rutaReporte}`);

    const falla = !r.exitoso || (values.estricto && r.sinFila.length > 0);
    console.log(
      falla
        ? '\n✘ HAY DIFERENCIAS: revisa el detalle.'
        : '\n✔ CORRECTO: lo cargado coincide con la fuente limpia.',
    );
    process.exit(falla ? 2 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n❌  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
