import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client.js';

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL no definida en .env');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APLICAR = process.argv.includes('--apply');

/**
 * OCs creadas antes de que el plan de pagos viviera en `Pago` (cuando
 * adelanto/saldo eran solo 2 campos descriptivos en OrdenCompra, sin filas
 * reales) se quedarían sin cuotas al pasar el Excel/PDF a leer `oc.pagos`.
 * Este script les crea 2 `Pago` (adelanto + saldo) con esos porcentajes para
 * no perder el desglose histórico. Por defecto corre en modo lectura
 * (dry-run); pasa --apply para escribir.
 */
async function main() {
  const candidatas = await prisma.ordenCompra.findMany({
    where: {
      OR: [{ adelantoPorcentaje: { not: null } }, { saldoPorcentaje: { not: null } }],
    },
    include: { _count: { select: { pagos: true } } },
  });

  const sinPagos = candidatas.filter((oc) => oc._count.pagos === 0);

  console.log(`OCs con adelanto/saldo definido: ${candidatas.length}`);
  console.log(`De esas, sin ninguna fila en Pago: ${sinPagos.length}`);
  console.log('---');

  let creadas = 0;
  for (const oc of sinPagos) {
    const adelanto = oc.adelantoPorcentaje ? Number(oc.adelantoPorcentaje) : null;
    const saldo = oc.saldoPorcentaje ? Number(oc.saldoPorcentaje) : null;
    const tramos: { porcentaje: number; fechaProgramada: Date; concepto: string }[] = [];
    if (adelanto) {
      tramos.push({
        porcentaje: adelanto,
        fechaProgramada: oc.fechaEmision ?? oc.creadoEn,
        concepto: `Adelanto a la emisión de la ${oc.tipo === 'servicio' ? 'OS' : 'OC'} ${oc.numero}`,
      });
    }
    if (saldo) {
      tramos.push({
        porcentaje: saldo,
        fechaProgramada: oc.fechaEntrega ?? oc.fechaEmision ?? oc.creadoEn,
        concepto: `Saldo al término de obra — ${oc.numero}`,
      });
    }
    if (tramos.length === 0) continue;

    console.log(
      `${APLICAR ? '✔ ' : '(dry-run) '}${oc.numero}: ${tramos.map((t) => `${t.porcentaje}%`).join(' + ')}`,
    );

    if (APLICAR) {
      await prisma.pago.createMany({
        data: tramos.map((t) => ({
          ordenCompraId: oc.id,
          proyectoId: oc.proyectoId,
          concepto: t.concepto,
          porcentaje: t.porcentaje,
          monto: (Number(oc.montoTotal) * t.porcentaje) / 100,
          fechaProgramada: t.fechaProgramada,
          registradoPorId: oc.creadoPorId,
        })),
      });
      creadas += tramos.length;
    }
  }

  console.log('---');
  console.log(
    APLICAR
      ? `Pagos creados: ${creadas}`
      : `Modo lectura: no se escribió nada. Corre con --apply para aplicar.`,
  );
}

main()
  .catch((e) => {
    console.error('❌  Error:', e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
