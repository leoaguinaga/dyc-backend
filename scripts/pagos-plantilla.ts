import { parseArgs } from 'node:util';
import {
  TIPOS_GASTO_BASE,
  TIPOS_OPERACION_BASE,
  construirPlantilla,
} from '../src/modules/pagos/importacion/plantilla-xlsx.js';
import type { ListasPlantilla } from '../src/modules/pagos/importacion/plantilla-xlsx.js';
import { EMPRESA_POR_DEFECTO_RUC } from '../src/modules/pagos/importacion/columnas.js';
import { crearPrisma, describirBd } from './pagos-cli.js';

const AYUDA = `
Genera la plantilla xlsx para que tesorería anote los pagos que faltan.

  pnpm pagos:plantilla [salida.xlsx] [--sin-bd]

Con la base conectada, la hoja "Listas" trae las obras, empresas y cuentas reales
(desplegables en la hoja "Pagos"). Con --sin-bd usa solo las listas base.
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'sin-bd': { type: 'boolean', default: false },
      ayuda: { type: 'boolean', default: false },
    },
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return;
  }
  const salida = positionals[0] ?? 'plantilla-carga-pagos.xlsx';

  const listas: ListasPlantilla = {
    tiposOperacion: TIPOS_OPERACION_BASE,
    tiposGasto: TIPOS_GASTO_BASE,
    centrosCosto: [],
    empresas: [
      {
        ruc: EMPRESA_POR_DEFECTO_RUC,
        razonSocial: 'D&C INGENIERIA Y PROYECTOS SAC',
      },
    ],
    cuentas: [],
  };

  if (!values['sin-bd']) {
    const prisma = crearPrisma();
    try {
      console.log(`Base de datos: ${describirBd()}`);
      const [proyectos, empresas, cuentas, categorias] = await Promise.all([
        prisma.proyecto.findMany({
          where: { codigo: { not: null } },
          select: { codigo: true, nombre: true },
          orderBy: { codigo: 'asc' },
        }),
        prisma.empresa.findMany({
          where: { activa: true },
          select: { ruc: true, razonSocial: true },
          orderBy: { razonSocial: 'asc' },
        }),
        prisma.cuentaEmpresa.findMany({
          where: { activa: true },
          select: { banco: true, numero: true },
          orderBy: { banco: 'asc' },
        }),
        prisma.pago.findMany({
          where: { categoria: { not: null } },
          distinct: ['categoria'],
          select: { categoria: true },
        }),
      ]);
      listas.centrosCosto = proyectos.map((p) => ({
        codigo: p.codigo!,
        nombre: p.nombre,
      }));
      if (empresas.length) listas.empresas = empresas;
      listas.cuentas = cuentas;
      const conocidos = new Set(TIPOS_GASTO_BASE.map((t) => t.toUpperCase()));
      listas.tiposGasto = [
        ...TIPOS_GASTO_BASE,
        ...categorias
          .map((c) => c.categoria!)
          .filter((c) => !conocidos.has(c.toUpperCase())),
      ];
    } finally {
      await prisma.$disconnect();
    }
  }

  await construirPlantilla(listas).xlsx.writeFile(salida);
  console.log(
    `✔ Plantilla guardada en ${salida} (${listas.centrosCosto.length} obras, ${listas.cuentas.length} cuentas, ${listas.tiposGasto.length} tipos de gasto en las listas)`,
  );
}

main().catch((err) => {
  console.error(`\n❌  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
