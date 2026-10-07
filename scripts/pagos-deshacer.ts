import { parseArgs } from 'node:util';
import { PagosImportService } from '../src/modules/pagos/importacion/importacion.service.js';
import { confirmarEscritura, crearPrisma, describirBd } from './pagos-cli.js';

const AYUDA = `
Lista o deshace lotes de carga masiva de pagos.

  pnpm pagos:lotes                       Lista los lotes cargados
  pnpm pagos:deshacer <loteId>           Simula: muestra qué se revertiría
  pnpm pagos:deshacer <loteId> --aplicar Revierte: borra los pagos creados por el lote,
                                         devuelve los enlazados a su estado anterior y
                                         quita las obras que el lote creó (si nadie más las usa)

  --forzar   Borra aunque algún pago del lote ya tenga comprobantes adjuntos
  --si       No pide confirmación
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      aplicar: { type: 'boolean', default: false },
      forzar: { type: 'boolean', default: false },
      si: { type: 'boolean', default: false },
      ayuda: { type: 'boolean', default: false },
    },
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return;
  }

  const prisma = crearPrisma();
  try {
    console.log(`Base de datos: ${describirBd()}`);
    const servicio = new PagosImportService(prisma);
    const idLote = positionals[0];

    if (!idLote) {
      const lotes = await servicio.listarLotes();
      if (!lotes.length) return console.log('No hay lotes de carga masiva.');
      for (const l of lotes) {
        const estado = l.deshechoEn
          ? `DESHECHO ${l.deshechoEn.toISOString().slice(0, 10)}`
          : 'vigente';
        console.log(
          `${l.id}  ${l.creadoEn.toISOString().slice(0, 16).replace('T', ' ')}  ${l.archivo}${l.etiqueta ? ` [${l.etiqueta}]` : ''}  ` +
            `creados ${l.creados}, enlazados ${l.vinculados}, pagos vivos ${l._count.pagos}  por ${l.creadoPor.name}  (${estado})`,
        );
      }
      return;
    }

    const lote = await prisma.importacionPagos.findUnique({
      where: { id: idLote },
      include: { _count: { select: { pagos: true } } },
    });
    if (!lote) throw new Error(`No existe el lote ${idLote}`);
    console.log(
      `Lote ${lote.id}: ${lote.archivo}${lote.etiqueta ? ` [${lote.etiqueta}]` : ''}`,
    );
    console.log(`  Pagos creados que se borrarían: ${lote._count.pagos}`);
    console.log(
      `  Pagos enlazados que volverían a su estado anterior: ${lote.vinculados}`,
    );

    if (!values.aplicar) {
      console.log(
        '\nSimulación: no se modificó nada. Repite con --aplicar para revertir.',
      );
      return;
    }
    if (
      !(await confirmarEscritura(
        `DESHACER el lote ${lote.id} (${lote._count.pagos} pagos)`,
        values.si,
      ))
    ) {
      console.log('Cancelado: no se modificó nada.');
      process.exit(1);
    }
    const r = await servicio.deshacer(lote.id, { forzar: values.forzar });
    console.log(
      `\n✔ Lote deshecho: ${r.borrados} pago(s) borrado(s), ${r.restaurados} restaurado(s).`,
    );
    if (r.obrasConservadas.length)
      console.log(
        `  Obras que se conservaron porque ya tienen otros datos: ${r.obrasConservadas.length}`,
      );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n❌  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
