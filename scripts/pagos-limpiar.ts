import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { leerCatalogos } from '../src/modules/pagos/etl/catalogos.js';
import {
  construirDecisiones,
  leerDecisiones,
} from '../src/modules/pagos/etl/decisiones.js';
import {
  limpiarMaestra,
  parseCorrelativo,
} from '../src/modules/pagos/etl/limpiador.js';
import {
  construirLimpio,
  construirReporteEtl,
} from '../src/modules/pagos/etl/reporte-etl.js';
import { leerXlsx } from '../src/modules/pagos/importacion/lector-xlsx.js';
import { claveCodigo } from '../src/modules/pagos/importacion/normalizacion.js';
import { crearPrisma, describirBd, parseFechaArg, soles } from './pagos-cli.js';

const AYUDA = `
ETL del Excel de tesorería: lee la lista maestra, la limpia con reglas auditables y
deja (1) una fuente limpia lista para "pnpm pagos:importar", (2) un reporte de lo que
cambió/excluyó/falta decidir y (3) un archivo de decisiones que tú editas.

  pnpm pagos:limpiar <COMPROBANTES.xlsx> [opciones]

Opciones
  --hasta-comprobante 26-1828   Solo comprobantes hasta ese (inclusive): el histórico
  --desde-comprobante 26-1829   Solo comprobantes desde ese (inclusive)
  --desde AAAA-MM-DD            Además, solo fechas de operación desde ese día
  --hasta AAAA-MM-DD            Además, solo fechas de operación hasta ese día
  --hoja "nombre"               Hoja con la lista maestra (por defecto "LISTA MAESTRA")
  --decisiones <ruta.xlsx>      Archivo de decisiones (por defecto <salida>/decisiones.xlsx)
  --salida <carpeta>            Dónde dejar los archivos (por defecto ./etl-salida)
  --sin-bd                      No consulta la base (por defecto lee las obras que ya existen)

Los archivos de salida contienen cuentas bancarias y nombres: no los subas al repositorio.
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'hasta-comprobante': { type: 'string' },
      'desde-comprobante': { type: 'string' },
      desde: { type: 'string' },
      hasta: { type: 'string' },
      hoja: { type: 'string' },
      decisiones: { type: 'string' },
      salida: { type: 'string', default: 'etl-salida' },
      'sin-bd': { type: 'boolean', default: false },
      ayuda: { type: 'boolean', default: false },
    },
  });
  const archivo = positionals[0];
  if (values.ayuda || !archivo) {
    console.log(AYUDA);
    process.exit(archivo ? 0 : 1);
  }

  mkdirSync(values.salida, { recursive: true });
  const base = path.basename(archivo).replace(/\.xlsx?$/i, '');
  const rutaDecisiones =
    values.decisiones ?? path.join(values.salida, 'decisiones.xlsx');

  console.log(`Archivo:       ${archivo}`);
  let lectura: Awaited<ReturnType<typeof leerXlsx>>;
  try {
    lectura = await leerXlsx(archivo, { hoja: values.hoja ?? 'LISTA MAESTRA' });
  } catch (err) {
    if (
      values.hoja ||
      !(err instanceof Error) ||
      !err.message.startsWith('No existe la hoja')
    )
      throw err;
    lectura = await leerXlsx(archivo);
  }
  console.log(
    `Hoja leída:    "${lectura.hoja}" (${lectura.filas.length} filas con datos)`,
  );

  const catalogos = await leerCatalogos(archivo);
  console.log(
    catalogos
      ? `Catálogos (DATOS): ${catalogos.centros.length} centros de costo, ${catalogos.proveedores.length} proveedores, ${catalogos.tiposGasto.length} tipos de gasto, ${catalogos.responsables.length} responsables, ${catalogos.empresas.length} empresas`
      : 'Catálogos: el libro no tiene hoja DATOS; se limpia sin validar contra catálogo',
  );

  const decididas = await leerDecisiones(rutaDecisiones);
  if (decididas.centros.size || decididas.correcciones.length) {
    console.log(
      `Decisiones previas: ${decididas.centros.size} centros de costo, ${decididas.correcciones.length} correcciones (${rutaDecisiones})`,
    );
  }

  let existentes: Set<string> | null = null;
  if (!values['sin-bd']) {
    const prisma = crearPrisma();
    try {
      console.log(
        `Base de datos: ${describirBd()} (solo lectura: obras existentes)`,
      );
      const obras = await prisma.proyecto.findMany({
        where: { codigo: { not: null } },
        select: { codigo: true },
      });
      existentes = new Set(obras.map((o) => claveCodigo(o.codigo)));
    } finally {
      await prisma.$disconnect();
    }
  }

  const desdeCorrelativo = values['desde-comprobante']
    ? parseCorrelativo(values['desde-comprobante'])
    : undefined;
  const hastaCorrelativo = values['hasta-comprobante']
    ? parseCorrelativo(values['hasta-comprobante'])
    : undefined;
  const resultado = limpiarMaestra(lectura.filas, {
    catalogos,
    decisiones: decididas.centros,
    correcciones: decididas.correcciones,
    desdeCorrelativo,
    hastaCorrelativo,
    desde: parseFechaArg(values.desde, '--desde'),
    hasta: parseFechaArg(values.hasta, '--hasta'),
  });

  const rango =
    [
      desdeCorrelativo !== undefined && `comprobante ≥ ${desdeCorrelativo}`,
      hastaCorrelativo !== undefined && `comprobante ≤ ${hastaCorrelativo}`,
      values.desde && `fecha ≥ ${values.desde}`,
      values.hasta && `fecha ≤ ${values.hasta}`,
    ]
      .filter(Boolean)
      .join(', ') || 'todo el archivo';

  const activaDesde = new Date(Date.now() - 60 * 86_400_000);
  const rutaLimpio = path.join(values.salida, `${base}.limpio.xlsx`);
  const rutaReporte = path.join(values.salida, `${base}.reporte-etl.xlsx`);
  await construirLimpio(resultado.filas).xlsx.writeFile(rutaLimpio);
  await construirReporteEtl(resultado, {
    archivo: path.basename(archivo),
    hoja: lectura.hoja,
    rango,
  }).xlsx.writeFile(rutaReporte);
  await construirDecisiones({
    centros: resultado.centros,
    decisiones: resultado.decisiones,
    correcciones: decididas.correcciones,
    excepciones: resultado.excepciones,
    existentes,
    activaDesde,
  }).xlsx.writeFile(rutaDecisiones);

  const c = resultado.conteos;
  console.log(`\n──────── ETL (${rango}) ────────`);
  console.log(
    `Filas leídas:             ${c.leidas}  (fuera del rango: ${c.fueraDeRango})`,
  );
  console.log(
    `Fuente limpia:            ${resultado.control.filas} filas   S/ ${soles(resultado.control.importe)}`,
  );
  const porMotivo = new Map<string, number>();
  for (const e of resultado.exclusiones)
    porMotivo.set(e.motivo, (porMotivo.get(e.motivo) ?? 0) + 1);
  console.log(
    `Excluidas:                ${resultado.exclusiones.length}${[...porMotivo].map(([m, n]) => `  ${m}: ${n}`).join('')}`,
  );
  console.log(
    `Cambios automáticos:      ${resultado.cambios.length}  (fechas en texto: ${c.fechasEnTexto}${Object.entries(
      c.cambiosPorRegla,
    )
      .filter(([r]) => r !== 'fecha-texto')
      .map(([r, n]) => `, ${r}: ${n}`)
      .join('')})`,
  );
  const revisar = resultado.excepciones.filter(
    (e) => e.severidad === 'revisar',
  );
  console.log(
    `Para revisar:             ${revisar.length}   (informativas: ${resultado.excepciones.length - revisar.length})`,
  );
  for (const e of revisar.slice(0, 10))
    console.log(
      `   fila ${String(e.fila).padEnd(5)} ${e.comprobante.padEnd(10)} ${e.tipo}: ${e.detalle}`,
    );

  const nuevas = resultado.centros.filter((x) => x.propuestaNueva);
  const sinObra = existentes
    ? resultado.centros.filter(
        (x) =>
          x.decision.accion === 'obra' &&
          !existentes.has(claveCodigo(x.decision.codigoSistema)),
      )
    : [];
  const activasSinObra = sinObra.filter((x) => x.ultimoPago >= activaDesde);
  console.log(
    `\nCentros de costo:         ${resultado.centros.length} (${nuevas.length} con acción propuesta por primera vez)`,
  );
  if (existentes) {
    console.log(
      `  Obras que NO existen en el sistema: ${sinObra.length} (${activasSinObra.length} con pagos en los últimos 60 días: créalas en /proyectos antes de cargar)`,
    );
  }
  console.log(`\nArchivos en ${values.salida}/`);
  console.log(
    `  ${path.basename(rutaLimpio)}        ← la fuente limpia (esto se carga)`,
  );
  console.log(
    `  ${path.basename(rutaReporte)}  ← qué se leyó, cambió, excluyó y qué revisar`,
  );
  console.log(
    `  ${path.basename(rutaDecisiones)}              ← centros de costo y correcciones: edítalo y vuelve a correr`,
  );
}

main().catch((err) => {
  console.error(`\n❌  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
