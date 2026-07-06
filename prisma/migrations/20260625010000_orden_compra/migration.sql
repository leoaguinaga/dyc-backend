-- Make proyectoId optional in solicitudes_cotizacion
-- (solicitudes linked to a requerimiento derive their project from it)
ALTER TABLE "solicitudes_cotizacion" ALTER COLUMN "proyectoId" DROP NOT NULL;

-- New enum for OC state machine
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('borrador', 'emitida', 'recibida_parcial', 'recibida', 'cancelada');

-- Órdenes de compra
CREATE TABLE "ordenes_compra" (
  "id"            TEXT NOT NULL,
  "numero"        TEXT NOT NULL,
  "solicitudId"   TEXT NOT NULL,
  "proveedorId"   TEXT NOT NULL,
  "proyectoId"    TEXT NOT NULL,
  "estado"        "EstadoOrdenCompra" NOT NULL DEFAULT 'borrador',
  "fechaEmision"  TIMESTAMP(3),
  "fechaEntrega"  TIMESTAMP(3),
  "montoTotal"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "nota"          TEXT,
  "creadoPorId"   TEXT NOT NULL,
  "creadoEn"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ordenes_compra_numero_key" ON "ordenes_compra"("numero");

ALTER TABLE "ordenes_compra"
  ADD CONSTRAINT "ordenes_compra_solicitudId_fkey"
  FOREIGN KEY ("solicitudId") REFERENCES "solicitudes_cotizacion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ordenes_compra"
  ADD CONSTRAINT "ordenes_compra_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ordenes_compra"
  ADD CONSTRAINT "ordenes_compra_proyectoId_fkey"
  FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ordenes_compra"
  ADD CONSTRAINT "ordenes_compra_creadoPorId_fkey"
  FOREIGN KEY ("creadoPorId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ítems de la orden de compra
CREATE TABLE "orden_compra_items" (
  "id"              TEXT NOT NULL,
  "ordenId"         TEXT NOT NULL,
  "descripcion"     TEXT NOT NULL,
  "cantidad"        DECIMAL(12,2) NOT NULL,
  "unidad"          "UnidadMedida" NOT NULL DEFAULT 'und',
  "precioUnitario"  DECIMAL(12,2) NOT NULL,
  "precioTotal"     DECIMAL(12,2) NOT NULL,
  CONSTRAINT "orden_compra_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orden_compra_items"
  ADD CONSTRAINT "orden_compra_items_ordenId_fkey"
  FOREIGN KEY ("ordenId") REFERENCES "ordenes_compra"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
