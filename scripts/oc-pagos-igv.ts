// Detecta (y opcionalmente corrige) OCs cuyo plan de pagos no cuadra con el
// monto final esperado (montoTotal + IGV si !incluyeIgv).
//   pnpm oc:pagos-igv            -> solo lista (no modifica nada)
//   pnpm oc:pagos-igv --apply    -> recalcula cuotas pendiente/borrador con % definido
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client.js';
import { montoConIgv } from '../src/shared/money/igv.util.js';

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL no definida en .env');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const ocs = await prisma.ordenCompra.findMany({
    include: { pagos: { where: { estado: { not: 'cancelado' } } } },
    orderBy: { numero: 'asc' },
  });

  let afectadas = 0;
  for (const oc of ocs) {
    if (oc.pagos.length === 0) continue;
    const esperado = r2(montoConIgv(Number(oc.montoTotal), oc.incluyeIgv));
    const actual = r2(oc.pagos.reduce((s, p) => s + Number(p.monto), 0));
    const pctTotal = oc.pagos.reduce((s, p) => s + Number(p.porcentaje ?? 0), 0);
    // Solo se evalúan OCs cuyo plan cubre el 100%; el resto es un plan parcial a propósito.
    if (Math.abs(pctTotal - 100) > 0.01 || Math.abs(esperado - actual) <= 0.05) continue;

    afectadas++;
    const bloqueadas = oc.pagos.filter((p) => !['pendiente', 'borrador'].includes(p.estado));
    console.log(
      `${oc.numero}: esperado ${esperado.toFixed(2)} | cuotas ${actual.toFixed(2)} | incluyeIgv=${oc.incluyeIgv}` +
        (bloqueadas.length ? `  ⚠ ${bloqueadas.length} cuota(s) ya pagada(s)/en proceso: revisar a mano` : ''),
    );

    if (!apply) continue;
    for (const p of oc.pagos) {
      if (!['pendiente', 'borrador'].includes(p.estado) || p.porcentaje == null) continue;
      await prisma.pago.update({
        where: { id: p.id },
        data: { monto: r2((esperado * Number(p.porcentaje)) / 100) },
      });
    }
  }
  console.log(`\n${afectadas} OC afectada(s) de ${ocs.length}. ${apply ? 'Corregidas.' : 'Dry-run: nada modificado (usa --apply).'}`);
}

main().finally(() => prisma.$disconnect());
