/*
  Warnings:

  - Made the column `porcentaje` on table `pagos` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "pagos" ALTER COLUMN "porcentaje" SET NOT NULL;
