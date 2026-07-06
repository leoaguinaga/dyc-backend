/*
  Warnings:

  - A unique constraint covering the columns `[codigo]` on the table `obras` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "obras" ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "coordinadorCliente" TEXT,
ADD COLUMN     "coordinadorEmpresaId" TEXT,
ADD COLUMN     "ejecutor" TEXT,
ADD COLUMN     "fechaFinReal" TIMESTAMP(3),
ADD COLUMN     "fechaInicioReal" TIMESTAMP(3),
ADD COLUMN     "prevencionistaId" TEXT;

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_rut_key" ON "clientes"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "obras_codigo_key" ON "obras"("codigo");

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_coordinadorEmpresaId_fkey" FOREIGN KEY ("coordinadorEmpresaId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_prevencionistaId_fkey" FOREIGN KEY ("prevencionistaId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
