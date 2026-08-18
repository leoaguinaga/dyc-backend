-- CreateEnum
CREATE TYPE "EstadoCobro" AS ENUM ('pendiente', 'cobrado', 'cancelado');

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'cobro_por_vencer';
ALTER TYPE "TipoNotificacion" ADD VALUE 'cobro_vencido';

-- CreateTable
CREATE TABLE "cobros" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "fechaCobrada" TIMESTAMP(3),
    "estado" "EstadoCobro" NOT NULL DEFAULT 'pendiente',
    "actaConformidadNombre" TEXT NOT NULL,
    "actaConformidadUrl" TEXT NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "cobradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cobros_proyectoId_key" ON "cobros"("proyectoId");

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_cobradoPorId_fkey" FOREIGN KEY ("cobradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
