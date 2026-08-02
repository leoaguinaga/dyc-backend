-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "toleranciaSalidaMinutos" INTEGER DEFAULT 60;

-- AlterTable
ALTER TABLE "turnos" ADD COLUMN     "fotoOmitida" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "motivoFotoOmitida" TEXT;

