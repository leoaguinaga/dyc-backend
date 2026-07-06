/*
  Warnings:

  - You are about to drop the column `rut` on the `clientes` table. All the data in the column will be lost.
  - You are about to drop the column `coordinadorCliente` on the `obras` table. All the data in the column will be lost.
  - You are about to drop the column `rut` on the `proveedores` table. All the data in the column will be lost.
  - You are about to drop the column `rut` on the `trabajadores` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[ruc]` on the table `clientes` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ruc]` on the table `proveedores` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[dni]` on the table `trabajadores` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ruc` to the `proveedores` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dni` to the `trabajadores` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "clientes_rut_key";

-- DropIndex
DROP INDEX "proveedores_rut_key";

-- DropIndex
DROP INDEX "trabajadores_rut_key";

-- AlterTable
ALTER TABLE "clientes" DROP COLUMN "rut",
ADD COLUMN     "ruc" TEXT;

-- AlterTable
ALTER TABLE "obras" DROP COLUMN "coordinadorCliente",
ADD COLUMN     "coordinadorClienteId" TEXT;

-- AlterTable
ALTER TABLE "proveedores" DROP COLUMN "rut",
ADD COLUMN     "ruc" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "trabajadores" DROP COLUMN "rut",
ADD COLUMN     "dni" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "contactos_clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "clienteId" TEXT NOT NULL,

    CONSTRAINT "contactos_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_ruc_key" ON "clientes"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_ruc_key" ON "proveedores"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "trabajadores_dni_key" ON "trabajadores"("dni");

-- AddForeignKey
ALTER TABLE "contactos_clientes" ADD CONSTRAINT "contactos_clientes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_coordinadorClienteId_fkey" FOREIGN KEY ("coordinadorClienteId") REFERENCES "contactos_clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
