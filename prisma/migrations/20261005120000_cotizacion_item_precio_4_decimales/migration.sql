-- El schema pasó precioUnit a 4 decimales (0822d39) pero la migración nunca se
-- escribió: la DB seguía redondeando a 2.
-- AlterTable
ALTER TABLE "cotizacion_items" ALTER COLUMN "precioUnit" SET DATA TYPE DECIMAL(12,4);
