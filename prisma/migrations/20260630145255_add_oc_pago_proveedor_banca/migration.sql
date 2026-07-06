/*
  Warnings:

  - The values [aprobada] on the enum `EstadoSolicitud` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EstadoSolicitud_new" AS ENUM ('borrador', 'enviada', 'cotizada', 'seleccionada', 'aprobada_solicitante', 'aprobada_gerencia', 'cancelada');
ALTER TABLE "public"."solicitudes_cotizacion" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "solicitudes_cotizacion" ALTER COLUMN "estado" TYPE "EstadoSolicitud_new" USING ("estado"::text::"EstadoSolicitud_new");
ALTER TYPE "EstadoSolicitud" RENAME TO "EstadoSolicitud_old";
ALTER TYPE "EstadoSolicitud_new" RENAME TO "EstadoSolicitud";
DROP TYPE "public"."EstadoSolicitud_old";
ALTER TABLE "solicitudes_cotizacion" ALTER COLUMN "estado" SET DEFAULT 'borrador';
COMMIT;

-- DropForeignKey
ALTER TABLE "solicitud_items" DROP CONSTRAINT "solicitud_items_itemInventarioId_fkey";

-- DropForeignKey
ALTER TABLE "solicitudes_cotizacion" DROP CONSTRAINT "solicitudes_cotizacion_proyectoId_fkey";

-- AlterTable
ALTER TABLE "cotizacion_items" ADD COLUMN     "seleccionado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN     "condicionesServicio" TEXT,
ADD COLUMN     "fechaEntrega" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orden_compra_items" ADD COLUMN     "codigo" TEXT;

-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "adelantoPorcentaje" DECIMAL(5,2),
ADD COLUMN     "contactoProveedorNombre" TEXT,
ADD COLUMN     "contactoProveedorTelefono" TEXT,
ADD COLUMN     "detraccionPorcentaje" DECIMAL(5,2),
ADD COLUMN     "lugarEntrega" TEXT,
ADD COLUMN     "saldoPorcentaje" DECIMAL(5,2),
ADD COLUMN     "tipoCambio" DECIMAL(8,4),
ALTER COLUMN "actualizadoEn" DROP DEFAULT;

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "banco" TEXT,
ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "moneda" TEXT,
ADD COLUMN     "numeroCuenta" TEXT;

-- AlterTable
ALTER TABLE "requerimientos" ADD COLUMN     "fechaEntregaRequerida" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "solicitud_items" ALTER COLUMN "descripcion" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "solicitudes_cotizacion" ADD CONSTRAINT "solicitudes_cotizacion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_items" ADD CONSTRAINT "solicitud_items_itemInventarioId_fkey" FOREIGN KEY ("itemInventarioId") REFERENCES "items_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
