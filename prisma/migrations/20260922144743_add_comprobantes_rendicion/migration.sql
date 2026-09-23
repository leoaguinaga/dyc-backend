-- CreateEnum
CREATE TYPE "TipoDocumentoComprobante" AS ENUM ('factura', 'boleta', 'guia_remision', 'recibo', 'nota_credito', 'nota_debito', 'voucher_deposito', 'otro');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('abierto', 'cerrado');

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "subNumero" INTEGER NOT NULL DEFAULT 1,
    "tipoDocumento" "TipoDocumentoComprobante" NOT NULL DEFAULT 'otro',
    "tipoOperacion" TEXT,
    "banco" TEXT,
    "cuenta" TEXT,
    "detalleGasto" TEXT,
    "proveedor" TEXT,
    "cuentaProveedor" TEXT,
    "importe" DECIMAL(12,2) NOT NULL,
    "importeRendido" DECIMAL(12,2),
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'abierto',
    "archivoNombre" TEXT NOT NULL,
    "archivoUrl" TEXT NOT NULL,
    "generadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comprobantes_pagoId_idx" ON "comprobantes"("pagoId");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "pagos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_generadoPorId_fkey" FOREIGN KEY ("generadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: crear un comprobante por cada pago que ya tenía un comprobante único adjunto,
-- para no perder los archivos subidos antes de este cambio.
INSERT INTO "comprobantes" (
  "id", "pagoId", "numero", "subNumero", "tipoDocumento", "importe", "estado",
  "archivoNombre", "archivoUrl", "generadoPorId", "creadoEn", "actualizadoEn"
)
SELECT
  'mig_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20),
  p."id",
  'MIGRADO-' || p."id",
  1,
  'otro'::"TipoDocumentoComprobante",
  p."monto",
  CASE WHEN p."estado" = 'pagado' THEN 'cerrado'::"EstadoComprobante" ELSE 'abierto'::"EstadoComprobante" END,
  COALESCE(p."comprobanteNombre", 'Comprobante migrado'),
  p."comprobanteUrl",
  COALESCE(p."pagadoPorId", p."registradoPorId"),
  p."creadoEn",
  p."actualizadoEn"
FROM "pagos" p
WHERE p."comprobanteUrl" IS NOT NULL AND p."comprobanteUrl" <> '';
