-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'asistencia_cierre_automatico';

-- AlterTable
ALTER TABLE "turnos" ADD COLUMN "cierreAutomatico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cierreRevisadoEn" TIMESTAMP(3),
ADD COLUMN "cierreRevisadoPorId" TEXT;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_cierreRevisadoPorId_fkey" FOREIGN KEY ("cierreRevisadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
