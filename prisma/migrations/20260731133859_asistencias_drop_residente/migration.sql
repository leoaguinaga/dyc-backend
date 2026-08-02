-- DropForeignKey
ALTER TABLE "proyectos" DROP CONSTRAINT "proyectos_residenteId_fkey";

-- AlterTable
ALTER TABLE "proyectos" DROP COLUMN "residenteId";

