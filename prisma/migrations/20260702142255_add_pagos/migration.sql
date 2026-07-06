-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('pendiente', 'pagado', 'cancelado');

-- CreateEnum
CREATE TYPE "TipoBeneficiario" AS ENUM ('proveedor', 'trabajador');

-- CreateTable
CREATE TABLE "pagos" (
    "id" TEXT NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "tipoBeneficiario" "TipoBeneficiario" NOT NULL DEFAULT 'proveedor',
    "monto" DECIMAL(12,2) NOT NULL,
    "porcentaje" DECIMAL(5,2),
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "fechaPagoReal" TIMESTAMP(3),
    "estado" "EstadoPago" NOT NULL DEFAULT 'pendiente',
    "metodoPago" TEXT,
    "numeroOperacion" TEXT,
    "nota" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "pagadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_pagadoPorId_fkey" FOREIGN KEY ("pagadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
