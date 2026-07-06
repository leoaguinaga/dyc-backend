/*
  Warnings:

  - You are about to drop the column `stockActual` on the `items_inventario` table. All the data in the column will be lost.
  - You are about to drop the column `stockMinimo` on the `items_inventario` table. All the data in the column will be lost.
  - You are about to drop the column `ejecutor` on the `obras` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoAlmacen" AS ENUM ('fijo', 'temporal');

-- CreateEnum
CREATE TYPE "TipoTraslado" AS ENUM ('sobrante', 'equipos');

-- CreateEnum
CREATE TYPE "TipoItem" AS ENUM ('consumible', 'activo');

-- CreateEnum
CREATE TYPE "EstadoActivo" AS ENUM ('disponible', 'en_uso', 'baja');

-- DropForeignKey
ALTER TABLE "obras" DROP CONSTRAINT "obras_coordinadorEmpresaId_fkey";

-- DropForeignKey
ALTER TABLE "obras" DROP CONSTRAINT "obras_prevencionistaId_fkey";

-- AlterTable
ALTER TABLE "items_inventario" DROP COLUMN "stockActual",
DROP COLUMN "stockMinimo",
ADD COLUMN     "tipo" "TipoItem" NOT NULL DEFAULT 'consumible';

-- AlterTable
ALTER TABLE "obras" DROP COLUMN "ejecutor",
ADD COLUMN     "ejecutorId" TEXT;

-- CreateTable
CREATE TABLE "almacenes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoAlmacen" NOT NULL,
    "ciudad" TEXT,
    "obraId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "almacenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activos" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "serie" TEXT,
    "codigoInterno" TEXT,
    "estado" "EstadoActivo" NOT NULL DEFAULT 'disponible',
    "almacenActualId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traslados" (
    "id" TEXT NOT NULL,
    "tipo" "TipoTraslado" NOT NULL,
    "origenId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nota" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traslados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traslado_items" (
    "id" TEXT NOT NULL,
    "trasladoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2),
    "activoId" TEXT,

    CONSTRAINT "traslado_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "almacenes_obraId_key" ON "almacenes"("obraId");

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_coordinadorEmpresaId_fkey" FOREIGN KEY ("coordinadorEmpresaId") REFERENCES "trabajadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_ejecutorId_fkey" FOREIGN KEY ("ejecutorId") REFERENCES "trabajadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_prevencionistaId_fkey" FOREIGN KEY ("prevencionistaId") REFERENCES "trabajadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "almacenes" ADD CONSTRAINT "almacenes_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "obras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activos" ADD CONSTRAINT "activos_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activos" ADD CONSTRAINT "activos_almacenActualId_fkey" FOREIGN KEY ("almacenActualId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados" ADD CONSTRAINT "traslados_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados" ADD CONSTRAINT "traslados_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados" ADD CONSTRAINT "traslados_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado_items" ADD CONSTRAINT "traslado_items_trasladoId_fkey" FOREIGN KEY ("trasladoId") REFERENCES "traslados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado_items" ADD CONSTRAINT "traslado_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado_items" ADD CONSTRAINT "traslado_items_activoId_fkey" FOREIGN KEY ("activoId") REFERENCES "activos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
