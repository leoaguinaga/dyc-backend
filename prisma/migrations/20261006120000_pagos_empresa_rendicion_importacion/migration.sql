-- CreateEnum
CREATE TYPE "EstadoRendicion" AS ENUM ('abierto', 'cerrado');

-- DropIndex
DROP INDEX "pagos_codigoComprobante_key";

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "cuentaOrigenId" TEXT,
ADD COLUMN     "empresaId" TEXT,
ADD COLUMN     "estadoRendicion" "EstadoRendicion",
ADD COLUMN     "generadoPorNombre" TEXT,
ADD COLUMN     "importacionId" TEXT,
ADD COLUMN     "importeRendido" DECIMAL(12,2),
ADD COLUMN     "responsableRendicionId" TEXT,
ADD COLUMN     "responsableRendicionNombre" TEXT,
ADD COLUMN     "subNumero" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_empresa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importaciones_pagos" (
    "id" TEXT NOT NULL,
    "archivo" TEXT NOT NULL,
    "etiqueta" TEXT,
    "filas" INTEGER NOT NULL,
    "creados" INTEGER NOT NULL,
    "vinculados" INTEGER NOT NULL,
    "omitidos" INTEGER NOT NULL,
    "resumen" JSONB,
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deshechoEn" TIMESTAMP(3),

    CONSTRAINT "importaciones_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_ruc_key" ON "empresas"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_empresa_empresaId_numero_key" ON "cuentas_empresa"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "pagos_importacionId_idx" ON "pagos"("importacionId");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_codigoComprobante_subNumero_key" ON "pagos"("codigoComprobante", "subNumero");

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuentaOrigenId_fkey" FOREIGN KEY ("cuentaOrigenId") REFERENCES "cuentas_empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_responsableRendicionId_fkey" FOREIGN KEY ("responsableRendicionId") REFERENCES "trabajadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "importaciones_pagos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_empresa" ADD CONSTRAINT "cuentas_empresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones_pagos" ADD CONSTRAINT "importaciones_pagos_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- DataMigration: hasta hoy todos los pagos salieron de D&C (la constancia la
-- tenía fija), así que se crea esa empresa y se les asigna. Las cuentas de
-- origen se dan de alta con la primera carga o desde el sistema.
INSERT INTO "empresas" ("id", "razonSocial", "ruc", "actualizadoEn")
VALUES ('empresa_dyc', 'DIAZ & CASTILLO INGENIERÍA Y PROYECTOS SAC', '20608745611', CURRENT_TIMESTAMP)
ON CONFLICT ("ruc") DO NOTHING;

UPDATE "pagos"
SET "empresaId" = (SELECT "id" FROM "empresas" WHERE "ruc" = '20608745611')
WHERE "empresaId" IS NULL;
