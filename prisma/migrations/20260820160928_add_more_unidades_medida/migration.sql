-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UnidadMedida" ADD VALUE 'g';
ALTER TYPE "UnidadMedida" ADD VALUE 'ml';
ALTER TYPE "UnidadMedida" ADD VALUE 'docena';
ALTER TYPE "UnidadMedida" ADD VALUE 'ciento';
ALTER TYPE "UnidadMedida" ADD VALUE 'medio_ciento';
ALTER TYPE "UnidadMedida" ADD VALUE 'millar';
ALTER TYPE "UnidadMedida" ADD VALUE 'medio_millar';
ALTER TYPE "UnidadMedida" ADD VALUE 'balde';
ALTER TYPE "UnidadMedida" ADD VALUE 'galonera';
ALTER TYPE "UnidadMedida" ADD VALUE 'cilindro';
ALTER TYPE "UnidadMedida" ADD VALUE 'varilla';
ALTER TYPE "UnidadMedida" ADD VALUE 'plancha';
ALTER TYPE "UnidadMedida" ADD VALUE 'tubo';
ALTER TYPE "UnidadMedida" ADD VALUE 'pieza';
ALTER TYPE "UnidadMedida" ADD VALUE 'global';
