-- AlterTable
ALTER TABLE "cotizaciones" DROP COLUMN "adelantoPorcentaje",
DROP COLUMN "saldoPorcentaje";

-- CreateTable
CREATE TABLE "cotizacion_condiciones_pago" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizacion_condiciones_pago_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cotizacion_condiciones_pago" ADD CONSTRAINT "cotizacion_condiciones_pago_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

