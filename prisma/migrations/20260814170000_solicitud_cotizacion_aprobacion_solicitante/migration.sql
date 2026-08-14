-- AlterTable
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN     "aprobadaSolicitantePorId" TEXT,
ADD COLUMN     "aprobadaSolicitantePorRole" "Role",
ADD COLUMN     "aprobadaSolicitanteEn" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "solicitudes_cotizacion" ADD CONSTRAINT "solicitudes_cotizacion_aprobadaSolicitantePorId_fkey" FOREIGN KEY ("aprobadaSolicitantePorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
