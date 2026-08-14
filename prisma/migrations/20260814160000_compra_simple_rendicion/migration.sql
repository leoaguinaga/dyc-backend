-- Rename "urgente" to "esRendicion" (preserves existing values, no data loss)
ALTER TABLE "compras_simples" RENAME COLUMN "urgente" TO "esRendicion";

-- CreateEnum
CREATE TYPE "TipoArchivoCompraSimple" AS ENUM ('comprobante', 'foto_producto');

-- AlterTable
ALTER TABLE "compra_simple_grupo_archivos" ADD COLUMN "tipo" "TipoArchivoCompraSimple" NOT NULL DEFAULT 'comprobante';
