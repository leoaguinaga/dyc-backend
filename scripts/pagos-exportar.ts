import { parseArgs } from 'node:util';
import { construirExportacion } from '../src/modules/pagos/importacion/plantilla-xlsx.js';
import { crearPrisma, describirBd, parseFechaArg } from './pagos-cli.js';

const AYUDA = `
Exporta los pagos que el sistema ya tiene, en el formato del Excel de tesorería.
Sirve para comparar a mano contra el control de tesorería y ver qué falta.

  pnpm pagos:exportar [salida.xlsx] [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD]

Incluye pagados y pendientes (no borradores ni cancelados) con una columna que
indica el estado en el sistema.
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      desde: { type: 'string' },
      hasta: { type: 'string' },
      ayuda: { type: 'boolean', default: false },
    },
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return;
  }
  const salida = positionals[0] ?? 'pagos-en-el-sistema.xlsx';
  const desde = parseFechaArg(values.desde, '--desde');
  const hasta = parseFechaArg(values.hasta, '--hasta');

  const prisma = crearPrisma();
  try {
    console.log(`Base de datos: ${describirBd()}`);
    const rango = { gte: desde, lte: hasta };
    const pagos = await prisma.pago.findMany({
      where: {
        estado: { in: ['pagado', 'pendiente'] },
        OR: [
          { fechaPagoReal: rango },
          { fechaPagoReal: null, fechaProgramada: rango },
        ],
      },
      include: {
        empresa: { select: { razonSocial: true, ruc: true } },
        cuentaOrigen: { select: { banco: true, numero: true } },
        proyecto: { select: { codigo: true, nombre: true } },
        ordenCompra: {
          select: {
            proveedorNombreLibre: true,
            proveedor: { select: { razonSocial: true } },
            proyecto: { select: { codigo: true, nombre: true } },
          },
        },
        pagadoPor: { select: { name: true } },
      },
      orderBy: [{ fechaPagoReal: 'asc' }, { fechaProgramada: 'asc' }],
    });

    await construirExportacion(
      pagos.map((p) => {
        const obra = p.proyecto ?? p.ordenCompra?.proyecto ?? null;
        return {
          id: p.id,
          estado: p.estado,
          codigoComprobante: p.codigoComprobante,
          subNumero: p.subNumero,
          fecha: p.fechaPagoReal ?? p.fechaProgramada,
          monto: Number(p.monto),
          metodoPago: p.metodoPago,
          cuentaOrigen: p.cuentaOrigen,
          categoria: p.categoria,
          concepto: p.concepto ?? p.ordenCompra?.proveedorNombreLibre ?? null,
          responsable: p.responsableRendicionNombre,
          proveedor:
            p.beneficiarioNombre ??
            p.ordenCompra?.proveedor?.razonSocial ??
            p.ordenCompra?.proveedorNombreLibre ??
            null,
          cuentaProveedor: p.numeroCuenta,
          centroCosto:
            obra && obra.codigo
              ? { codigo: obra.codigo, nombre: obra.nombre }
              : null,
          importeRendido:
            p.importeRendido === null ? null : Number(p.importeRendido),
          generadoPor: p.pagadoPor?.name ?? p.generadoPorNombre,
          estadoRendicion: p.estadoRendicion,
          empresa: p.empresa,
          nota: p.nota,
        };
      }),
    ).xlsx.writeFile(salida);
    console.log(`✔ ${pagos.length} pago(s) exportado(s) a ${salida}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n❌  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
