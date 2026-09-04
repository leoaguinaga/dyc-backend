-- Permite que los pagos sean obligaciones operativas independientes de una OC.
ALTER TYPE "EstadoPago" ADD VALUE IF NOT EXISTS 'borrador';
ALTER TYPE "TipoBeneficiario" ADD VALUE IF NOT EXISTS 'otro';

ALTER TABLE "pagos"
  ALTER COLUMN "ordenCompraId" DROP NOT NULL,
  ALTER COLUMN "porcentaje" DROP NOT NULL,
  ADD COLUMN "origen" TEXT NOT NULL DEFAULT 'orden_compra',
  ADD COLUMN "centroCosto" TEXT NOT NULL DEFAULT 'obra',
  ADD COLUMN "proyectoId" TEXT,
  ADD COLUMN "concepto" TEXT,
  ADD COLUMN "categoria" TEXT,
  ADD COLUMN "beneficiarioNombre" TEXT,
  ADD COLUMN "banco" TEXT,
  ADD COLUMN "numeroCuenta" TEXT,
  ADD COLUMN "cci" TEXT;

UPDATE "pagos" p
SET
  "proyectoId" = oc."proyectoId",
  "concepto" = COALESCE(oc."concepto", prov."razonSocial", oc."proveedorNombreLibre", 'Pago de orden de compra')
FROM "ordenes_compra" oc
LEFT JOIN "proveedores" prov ON prov.id = oc."proveedorId"
WHERE p."ordenCompraId" = oc.id;

ALTER TABLE "pagos"
  ADD CONSTRAINT "pagos_proyectoId_fkey"
  FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "pagos_proyectoId_fechaProgramada_idx" ON "pagos"("proyectoId", "fechaProgramada");
CREATE INDEX "pagos_origen_estado_fechaProgramada_idx" ON "pagos"("origen", "estado", "fechaProgramada");
