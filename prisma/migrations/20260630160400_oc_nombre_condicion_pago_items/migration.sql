/*
  Warnings:

  - Added the required column `nombre` to the `requerimientos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN     "condicionPago" TEXT;

-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "condicionPago" TEXT,
ADD COLUMN     "nombre" TEXT;

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "condicionPago" TEXT;

-- AlterTable
ALTER TABLE "requerimientos" ADD COLUMN     "nombre" TEXT;
UPDATE "requerimientos" SET "nombre" = "codigo" WHERE "nombre" IS NULL;
ALTER TABLE "requerimientos" ALTER COLUMN "nombre" SET NOT NULL;
