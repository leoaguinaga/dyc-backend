-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('und', 'kg', 'm', 'm2', 'm3', 'l', 'gal', 'bolsa', 'caja', 'rollo', 'par', 'juego');

-- CreateTable
CREATE TABLE "items_inventario" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "unidad" "UnidadMedida" NOT NULL DEFAULT 'und',
    "categoria" TEXT,
    "stockActual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stockMinimo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "items_inventario_codigo_key" ON "items_inventario"("codigo");
