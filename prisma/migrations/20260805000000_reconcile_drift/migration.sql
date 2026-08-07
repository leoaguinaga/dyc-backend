-- AlterTable
ALTER TABLE "public"."trabajadores" ADD COLUMN     "banco" TEXT,
ADD COLUMN     "numeroCuenta" TEXT;

-- CreateTable
CREATE TABLE "public"."requerimiento_item_archivos" (
    "id" TEXT NOT NULL,
    "requerimientoItemId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requerimiento_item_archivos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."requerimiento_item_archivos" ADD CONSTRAINT "requerimiento_item_archivos_requerimientoItemId_fkey" FOREIGN KEY ("requerimientoItemId") REFERENCES "public"."requerimiento_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

