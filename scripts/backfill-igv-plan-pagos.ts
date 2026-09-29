import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client.js';
import { montoConIgv } from '../src/shared/money/igv.util.js';

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL no definida en .env');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APLICAR = process.argv.includes('--apply');

/**
 * Hasta ahora el plan de pagos de una OC (flujo cotización/solicitud, no
 * compras simples) repartía las cuotas sobre `montoTotal` (subtotal de
 * ítems, sin IGV) en vez del monto final. Este script recalcula las cuotas
 * `pendiente`/`borrador` de esas OCs con la misma fórmula que ya usa el
 * backend (`montoConIgv`). Las cuotas `pagado`/`cancelado` no se tocan: el
 * dinero ya se movió con el monto viejo. Por defecto es dry-run; pasa
 * --apply para escribir.
 */
async function main() {
  const pagos = await prisma.pago.findMany({
    where: {
      ordenCompraId: { not: null },
      estado: { in: ['pendiente', 'borrador'] },
      ordenCompra: { origen: 'macro' },
    },
    include: { ordenCompra: { select: { numero: true, montoTotal: true, incluyeIgv: true } } },
    orderBy: [{ ordenCompra: { numero: 'asc' } }, { fechaProgramada: 'asc' }],
  });

  console.log(`Cuotas pendiente/borrador en OCs (flujo cotización): ${pagos.length}`);
  console.log('---');

  let actualizadas = 0;
  for (const pago of pagos) {
    const oc = pago.ordenCompra!;
    const montoNuevo =
      Math.round(((montoConIgv(Number(oc.montoTotal), oc.incluyeIgv) * Number(pago.porcentaje)) / 100) * 100) / 100;
    const montoViejo = Number(pago.monto);

    if (Math.abs(montoNuevo - montoViejo) < 0.01) continue;

    console.log(
      `${APLICAR ? '✔ ' : '(dry-run) '}${oc.numero} · ${Number(pago.porcentaje)}% · ${montoViejo.toFixed(2)} → ${montoNuevo.toFixed(2)}`,
    );
    actualizadas++;

    if (APLICAR) {
      await prisma.pago.update({ where: { id: pago.id }, data: { monto: montoNuevo } });
    }
  }

  console.log('---');
  console.log(`${APLICAR ? 'Actualizadas' : 'Se actualizarían'}: ${actualizadas}`);
  if (!APLICAR && actualizadas > 0) console.log('Corre con --apply para escribir los cambios.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
