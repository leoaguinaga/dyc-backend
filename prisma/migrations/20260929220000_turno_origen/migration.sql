-- CreateEnum
CREATE TYPE "OrigenTurno" AS ENUM ('campo', 'hoja');

-- AlterTable
ALTER TABLE "turnos" ADD COLUMN "origen" "OrigenTurno" NOT NULL DEFAULT 'campo';
