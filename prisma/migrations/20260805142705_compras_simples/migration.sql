-- CreateEnum
CREATE TYPE "OrigenOrdenCompra" AS ENUM ('macro', 'simple');

-- CreateEnum
CREATE TYPE "EstadoAprobacionCompra" AS ENUM ('pendiente', 'aprobada', 'observada');

-- DropForeignKey
ALTER TABLE "ordenes_compra" DROP CONSTRAINT "ordenes_compra_proveedorId_fkey";

-- DropForeignKey
ALTER TABLE "ordenes_compra" DROP CONSTRAINT "ordenes_compra_solicitudId_fkey";

-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "aprobadoEn" TIMESTAMP(3),
ADD COLUMN     "aprobadoPorId" TEXT,
ADD COLUMN     "compraSimpleId" TEXT,
ADD COLUMN     "estadoAprobacion" "EstadoAprobacionCompra",
ADD COLUMN     "notaAprobacion" TEXT,
ADD COLUMN     "origen" "OrigenOrdenCompra" NOT NULL DEFAULT 'macro',
ADD COLUMN     "proveedorNombreLibre" TEXT,
ALTER COLUMN "solicitudId" DROP NOT NULL,
ALTER COLUMN "proveedorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "compras_simples" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compras_simples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compras_simples_codigo_key" ON "compras_simples"("codigo");

-- AddForeignKey
ALTER TABLE "compras_simples" ADD CONSTRAINT "compras_simples_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_simples" ADD CONSTRAINT "compras_simples_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "solicitudes_cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_compraSimpleId_fkey" FOREIGN KEY ("compraSimpleId") REFERENCES "compras_simples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
