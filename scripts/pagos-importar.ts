import path from 'node:path';
import { parseArgs } from 'node:util';
import { PagosImportService } from '../src/modules/pagos/importacion/importacion.service.js';
import type { FilaPlan } from '../src/modules/pagos/importacion/importacion.service.js';
import { leerXlsx } from '../src/modules/pagos/importacion/lector-xlsx.js';
import { construirReporte } from '../src/modules/pagos/importacion/reporte-xlsx.js';
import {
  confirmarEscritura,
  crearPrisma,
  describirBd,
  parseFechaArg,
  soles,
} from './pagos-cli.js';

const AYUDA = `
Carga masiva de pagos desde el Excel de tesorería.

  pnpm pagos:importar <archivo.xlsx> [opciones]

Sin --aplicar solo SIMULA: lee el archivo, valida cada fila, detecta duplicados y
escribe un reporte .xlsx. No modifica la base.

Opciones
  --aplicar              Escribe en la base (todo o nada, en una transacción)
  --usuario <email>      Usuario que queda como registrador (obligatorio con --aplicar)
  --hoja "nombre"        Hoja a leer (por defecto "Pagos" o la primera con las columnas del Excel)
  --desde AAAA-MM-DD     Solo filas con fecha de operación desde ese día (inclusive)
  --hasta AAAA-MM-DD     Solo filas con fecha de operación hasta ese día (inclusive)
  --vincular             Enlaza con pagos ya registrados que aún no tienen código
                         (mismo importe, misma obra, fecha cercana) en vez de dejarlos en REVISAR
  --crear-proyectos      Da de alta como "liquidada" las obras que no existan en el sistema
  --omitir-errores       Carga las filas válidas aunque otras tengan error
  --etiqueta "texto"     Nombre del lote (p. ej. "brecha ago-sep 2026")
  --reporte <ruta.xlsx>  Dónde guardar el reporte (por defecto junto al archivo)
  --si                   No pide confirmación antes de escribir
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      aplicar: { type: 'boolean', default: false },
      usuario: { type: 'string' },
      hoja: { type: 'string' },
      desde: { type: 'string' },
      hasta: { type: 'string' },
      vincular: { type: 'boolean', default: false },
      'crear-proyectos': { type: 'boolean', default: false },
      'omitir-errores': { type: 'boolean', default: false },
      etiqueta: { type: 'string' },
      reporte: { type: 'string' },
      si: { type: 'boolean', default: false },
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
    console.log(`Base de datos: ${describirBd()}`);
    console.log(`Archivo:       ${archivo}`);

    const lectura = await leerXlsx(archivo, { hoja: values.hoja });
    console.log(
      `Hoja leída:    "${lectura.hoja}" (${lectura.filas.length} filas con datos)`,
    );
    if (lectura.columnasOpcionalesAusentes.length) {
      console.log(
        `Columnas que no trae (opcionales): ${lectura.columnasOpcionalesAusentes.join(', ')}`,
      );
    }

    const servicio = new PagosImportService(prisma);
    const plan = await servicio.planificar(
      lectura.filas,
      path.basename(archivo),
      {
        desde: parseFechaArg(values.desde, '--desde'),
        hasta: parseFechaArg(values.hasta, '--hasta'),
        vincular: values.vincular,
        crearProyectos: values['crear-proyectos'],
      },
    );

    const rutaReporte =
      values.reporte ?? archivo.replace(/\.xlsx?$/i, '') + '.reporte.xlsx';
    await construirReporte(plan).xlsx.writeFile(rutaReporte);

    const r = plan.resumen;
    console.log('\n──────── Resultado de la simulación ────────');
    if (plan.fueraDeRango)
      console.log(
        `Fuera del rango de fechas (ignoradas):  ${plan.fueraDeRango}`,
      );
    console.log(`Filas analizadas:                       ${r.total}`);
    console.log(
      `  NUEVOS (se cargarán):                 ${r.crear}   S/ ${soles(r.montoCrear)}`,
    );
    console.log(`  YA EXISTEN (se omiten):               ${r.omitir}`);
    console.log(`  ENLAZAR con un pago ya registrado:    ${r.vincular}`);
    console.log(`  REVISAR (no se cargan):               ${r.revisar}`);
    console.log(`  ERRORES (no se cargan):               ${r.error}`);
    if (plan.proyectosFaltantes.length) {
      console.log(
        `\nObras que no existen en el sistema (${plan.proyectosFaltantes.length}):`,
      );
      for (const p of plan.proyectosFaltantes.slice(0, 10))
        console.log(
          `  ${p.codigo.padEnd(18)} ${p.descripcion}  (${p.filas} filas, S/ ${soles(p.monto)})`,
        );
      if (plan.proyectosFaltantes.length > 10)
        console.log(
          `  … y ${plan.proyectosFaltantes.length - 10} más (hoja "Obras faltantes" del reporte)`,
        );
      if (!values['crear-proyectos'])
        console.log('  → créalas en /proyectos o repite con --crear-proyectos');
    }
    if (plan.categoriasNuevas.length)
      console.log(
        `\nTipos de gasto nuevos: ${plan.categoriasNuevas.join(' | ')}`,
      );
    if (plan.empresasNuevas.length)
      console.log(
        `Empresas nuevas: ${plan.empresasNuevas.map((e) => `${e.razonSocial} (${e.ruc})`).join(' | ')}`,
      );
    if (plan.cuentasNuevas.length)
      console.log(
        `Cuentas de origen nuevas: ${plan.cuentasNuevas.map((c) => `${c.banco} ${c.numero}`).join(' | ')}`,
      );

    const problemas = plan.filas.filter(
      (f) => f.accion === 'error' || f.accion === 'revisar',
    );
    if (problemas.length) {
      console.log(`\nPrimeros problemas (de ${problemas.length}):`);
      for (const f of problemas.slice(0, 12))
        console.log(
          `  fila ${String(f.fila).padEnd(5)} ${f.accion === 'error' ? 'ERROR ' : 'REVISAR'}  ${resumenMensaje(f)}`,
        );
    }
    console.log(`\nReporte completo: ${rutaReporte}`);

    if (!values.aplicar) {
      console.log(
        '\nSimulación: no se escribió nada. Cuando el reporte esté limpio, repite con --aplicar --usuario <email>.',
      );
      process.exit(r.error > 0 ? 2 : 0);
    }

    if (r.crear + r.vincular === 0) {
      console.log('\nNo hay filas nuevas que cargar: no se escribió nada.');
      process.exit(r.error > 0 && !values['omitir-errores'] ? 2 : 0);
    }

    if (!values.usuario)
      throw new Error(
        'Con --aplicar indica --usuario <email> (queda como registrador de los pagos).',
      );
    const usuario = await prisma.user.findUnique({
      where: { email: values.usuario },
      select: { id: true, name: true },
    });
    if (!usuario)
      throw new Error(`No existe un usuario con el correo ${values.usuario}`);
    if (
      !(await confirmarEscritura(
        `cargar ${r.crear} pago(s) nuevo(s)${r.vincular ? ` y enlazar ${r.vincular}` : ''}`,
        values.si,
      ))
    ) {
      console.log('Cancelado: no se escribió nada.');
      process.exit(1);
    }

    const resultado = await servicio.aplicar(plan, {
      usuarioId: usuario.id,
      archivo: path.basename(archivo),
      etiqueta: values.etiqueta,
      omitirErrores: values['omitir-errores'],
    });
    console.log(
      `\n✔ Lote ${resultado.importacionId}: ${resultado.creados} pago(s) creado(s), ${resultado.vinculados} enlazado(s).`,
    );
    console.log(
      `  Para deshacerlo: pnpm pagos:deshacer ${resultado.importacionId} --aplicar`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function resumenMensaje(fila: FilaPlan): string {
  const mensaje =
    fila.mensajes.find((m) => m.nivel === 'error') ??
    fila.mensajes.find((m) => m.nivel === 'aviso') ??
    fila.mensajes[0];
  return `${fila.comprobante ?? '(sin código)'}  ${mensaje?.texto ?? ''}`;
}

main().catch((err) => {
  console.error(`\n❌  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
