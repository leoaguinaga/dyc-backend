/*
  Warnings:

  - You are about to drop the column `email` on the `clientes` table. All the data in the column will be lost.
  - You are about to drop the column `nombre` on the `clientes` table. All the data in the column will be lost.
  - You are about to drop the column `telefono` on the `clientes` table. All the data in the column will be lost.
  - Added the required column `razonSocial` to the `clientes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "clientes" DROP COLUMN "email",
DROP COLUMN "nombre",
DROP COLUMN "telefono",
ADD COLUMN     "nombreComercial" TEXT,
ADD COLUMN     "razonSocial" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "proyectos_trabajadores" RENAME CONSTRAINT "obras_trabajadores_pkey" TO "proyectos_trabajadores_pkey";

-- RenameForeignKey
ALTER TABLE "almacenes" RENAME CONSTRAINT "almacenes_obraId_fkey" TO "almacenes_proyectoId_fkey";

-- RenameForeignKey
ALTER TABLE "proyectos" RENAME CONSTRAINT "obras_clienteId_fkey" TO "proyectos_clienteId_fkey";

-- RenameForeignKey
ALTER TABLE "proyectos" RENAME CONSTRAINT "obras_coordinadorClienteId_fkey" TO "proyectos_coordinadorClienteId_fkey";

-- RenameForeignKey
ALTER TABLE "proyectos" RENAME CONSTRAINT "obras_coordinadorEmpresaId_fkey" TO "proyectos_coordinadorEmpresaId_fkey";

-- RenameForeignKey
ALTER TABLE "proyectos" RENAME CONSTRAINT "obras_ejecutorId_fkey" TO "proyectos_ejecutorId_fkey";

-- RenameForeignKey
ALTER TABLE "proyectos" RENAME CONSTRAINT "obras_prevencionistaId_fkey" TO "proyectos_prevencionistaId_fkey";

-- RenameForeignKey
ALTER TABLE "proyectos_supervisores" RENAME CONSTRAINT "obras_supervisores_obraId_fkey" TO "proyectos_supervisores_proyectoId_fkey";

-- RenameForeignKey
ALTER TABLE "proyectos_supervisores" RENAME CONSTRAINT "obras_supervisores_userId_fkey" TO "proyectos_supervisores_userId_fkey";

-- RenameForeignKey
ALTER TABLE "proyectos_trabajadores" RENAME CONSTRAINT "obras_trabajadores_obraId_fkey" TO "proyectos_trabajadores_proyectoId_fkey";

-- RenameForeignKey
ALTER TABLE "proyectos_trabajadores" RENAME CONSTRAINT "obras_trabajadores_trabajadorId_fkey" TO "proyectos_trabajadores_trabajadorId_fkey";

-- RenameForeignKey
ALTER TABLE "solicitudes_cotizacion" RENAME CONSTRAINT "solicitudes_cotizacion_obraId_fkey" TO "solicitudes_cotizacion_proyectoId_fkey";

-- RenameIndex
ALTER INDEX "almacenes_obraId_key" RENAME TO "almacenes_proyectoId_key";
