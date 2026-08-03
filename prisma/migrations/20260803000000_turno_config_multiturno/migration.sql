-- CreateTable
CREATE TABLE "turno_configs" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "cruzaMedianoche" BOOLEAN NOT NULL DEFAULT false,
    "toleranciaMinutos" INTEGER NOT NULL DEFAULT 10,
    "toleranciaSalidaMinutos" INTEGER NOT NULL DEFAULT 60,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turno_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "turno_configs_proyectoId_nombre_key" ON "turno_configs"("proyectoId", "nombre");

-- AddForeignKey
ALTER TABLE "turno_configs" ADD CONSTRAINT "turno_configs_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: ProyectoTrabajador gana turnoConfigId (nullable)
ALTER TABLE "proyectos_trabajadores" ADD COLUMN "turnoConfigId" TEXT;

-- AddForeignKey
ALTER TABLE "proyectos_trabajadores" ADD CONSTRAINT "proyectos_trabajadores_turnoConfigId_fkey" FOREIGN KEY ("turnoConfigId") REFERENCES "turno_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Turno gana turnoConfigId (nullable durante la migración — se backfillea y luego
-- se vuelve NOT NULL en una migración siguiente, junto con el cambio del unique index)
ALTER TABLE "turnos" ADD COLUMN "turnoConfigId" TEXT;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_turnoConfigId_fkey" FOREIGN KEY ("turnoConfigId") REFERENCES "turno_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
