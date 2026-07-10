-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN "incluyeIgv" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN "incluyeIgv" BOOLEAN NOT NULL DEFAULT false;
