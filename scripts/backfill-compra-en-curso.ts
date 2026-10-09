import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client.js';

// Se quitó el paso "registrar entrega en la OC" (columna "Compra en curso" del
// kanban de solicitudes). Desde 2026-10-07 la OC/OS nace emitida y el
// requerimiento pasa directo a `pendiente_conformidad`. Este script lleva a
// conformidad los requerimientos legacy que quedaron en `en_cotizacion` con
// todas sus órdenes ya emitidas (sin ninguna en borrador).
//
// Por defecto es dry-run. Usar `--apply` para escribir.
//   pnpm exec tsx scripts/backfill-compra-en-curso.ts [--apply]

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL no definida en .env');
  process.exit(1);
}

const apply = process.argv.includes('--apply');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const requerimientos = await prisma.requerimiento.findMany({
    where: {
      estado: 'en_cotizacion',
      solicitudes: {
        some: { estado: { not: 'cancelada' }, ordenes: { some: {} } },
      },
    },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      solicitudes: {
        where: { estado: { not: 'cancelada' } },
        select: {
          estado: true,
          ordenes: { select: { estado: true } },
        },
      },
    },
  });

  // Candidato: tiene al menos una OC emitida y ninguna activa en borrador, ni
  // solicitudes aún en cotización/aprobación (esas siguen en su columna).
  const candidatos = requerimientos.filter((req) => {
    const ordenes = req.solicitudes.flatMap((s) => s.ordenes);
    const enCurso = req.solicitudes.some((s) =>
      [
        'borrador',
        'enviada',
        'cotizada',
        'seleccionada',
        'aprobada_solicitante',
        'aprobada_gerencia',
      ].includes(s.estado),
    );
    return (
      !enCurso &&
      ordenes.some((o) => o.estado === 'emitida') &&
      !ordenes.some((o) => o.estado === 'borrador')
    );
  });

  console.log(
    `${candidatos.length} requerimiento(s) en "Compra en curso" legacy:`,
  );
  for (const req of candidatos) console.log(`  ${req.codigo}  ${req.nombre}`);

  if (!apply) {
    console.log('\nDry-run: no se escribió nada. Usa --apply para migrar.');
    return;
  }

  const { count } = await prisma.requerimiento.updateMany({
    where: { id: { in: candidatos.map((r) => r.id) }, estado: 'en_cotizacion' },
    data: { estado: 'pendiente_conformidad' },
  });
  console.log(`\n✅  ${count} requerimiento(s) pasados a pendiente_conformidad.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
