-- CreateEnum
CREATE TYPE "TipoOrdenCompra" AS ENUM ('compra', 'servicio');

-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "tipo" "TipoOrdenCompra" NOT NULL DEFAULT 'compra';
