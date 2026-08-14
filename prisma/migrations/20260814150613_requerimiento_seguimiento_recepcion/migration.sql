-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoRequerimiento" ADD VALUE 'en_cotizacion';
ALTER TYPE "EstadoRequerimiento" ADD VALUE 'pendiente_conformidad';
ALTER TYPE "EstadoRequerimiento" ADD VALUE 'recibido';

-- AlterTable
ALTER TABLE "requerimientos" ADD COLUMN     "recepcionComentario" TEXT,
ADD COLUMN     "recepcionEn" TIMESTAMP(3),
ADD COLUMN     "recepcionFotoUrl" TEXT,
ADD COLUMN     "recepcionPorId" TEXT;

-- AddForeignKey
ALTER TABLE "requerimientos" ADD CONSTRAINT "requerimientos_recepcionPorId_fkey" FOREIGN KEY ("recepcionPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
