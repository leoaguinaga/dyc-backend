-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'planilla_generada';

-- CreateTable
CREATE TABLE "planillas" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "periodoInicio" DATE NOT NULL,
    "periodoFin" DATE NOT NULL,
    "valorHoraExtra" DECIMAL(10,2) NOT NULL,
    "totalGeneral" DECIMAL(12,2) NOT NULL,
    "generadaPorId" TEXT NOT NULL,
    "generadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planilla_items" (
    "id" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "horasNormales" DECIMAL(6,2) NOT NULL,
    "horasExtraPagable" DECIMAL(6,2) NOT NULL,
    "precioHora" DECIMAL(10,2),
    "montoNormal" DECIMAL(12,2) NOT NULL,
    "montoExtra" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "planilla_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planillas_proyectoId_periodoInicio_periodoFin_key" ON "planillas"("proyectoId", "periodoInicio", "periodoFin");

-- CreateIndex
CREATE UNIQUE INDEX "planilla_items_planillaId_trabajadorId_key" ON "planilla_items"("planillaId", "trabajadorId");

-- AddForeignKey
ALTER TABLE "planillas" ADD CONSTRAINT "planillas_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planillas" ADD CONSTRAINT "planillas_generadaPorId_fkey" FOREIGN KEY ("generadaPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planilla_items" ADD CONSTRAINT "planilla_items_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "planillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planilla_items" ADD CONSTRAINT "planilla_items_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

