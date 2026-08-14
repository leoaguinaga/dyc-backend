-- AlterTable
ALTER TABLE "compras_simples" ADD COLUMN "aprobadoInformalPorId" TEXT;

-- AddForeignKey
ALTER TABLE "compras_simples" ADD CONSTRAINT "compras_simples_aprobadoInformalPorId_fkey" FOREIGN KEY ("aprobadoInformalPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
