-- CreateTable
CREATE TABLE "cotizacion_archivos" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_archivos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cotizacion_archivos" ADD CONSTRAINT "cotizacion_archivos_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
