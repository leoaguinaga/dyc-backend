ALTER TABLE "pagos" ADD COLUMN "codigoComprobante" TEXT;

CREATE UNIQUE INDEX "pagos_codigoComprobante_key" ON "pagos"("codigoComprobante");
