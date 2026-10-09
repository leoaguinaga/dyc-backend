-- CreateEnum
CREATE TYPE "PrioridadRequerimiento" AS ENUM ('normal', 'alta', 'urgente');

-- AlterTable: la columna `urgente` se conserva hasta migrar todos los consumidores.
ALTER TABLE "requerimientos" ADD COLUMN "prioridad" "PrioridadRequerimiento" NOT NULL DEFAULT 'normal';

-- Backfill
UPDATE "requerimientos" SET "prioridad" = 'urgente' WHERE "urgente" = true;
