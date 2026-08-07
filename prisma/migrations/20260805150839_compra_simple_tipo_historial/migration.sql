/*
  Warnings:

  - Added the required column `nombre` to the `compras_simples` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "compras_simples" ADD COLUMN     "nombre" TEXT NOT NULL,
ADD COLUMN     "tipo" "TipoRequerimiento" NOT NULL DEFAULT 'civil',
ADD COLUMN     "urgente" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "compra_simple_grupo_historial" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "estado" "EstadoAprobacionCompra" NOT NULL,
    "nota" TEXT,
    "actorId" TEXT,
    "actorRole" "Role",
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compra_simple_grupo_historial_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "compra_simple_grupo_historial" ADD CONSTRAINT "compra_simple_grupo_historial_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_simple_grupo_historial" ADD CONSTRAINT "compra_simple_grupo_historial_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
