-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN     "creadoPorId" TEXT;

-- AlterTable
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN     "aprobadaGerenciaEn" TIMESTAMP(3),
ADD COLUMN     "aprobadaGerenciaPorId" TEXT,
ADD COLUMN     "aprobadaGerenciaPorRole" "Role";

-- AddForeignKey
ALTER TABLE "solicitudes_cotizacion" ADD CONSTRAINT "solicitudes_cotizacion_aprobadaGerenciaPorId_fkey" FOREIGN KEY ("aprobadaGerenciaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
