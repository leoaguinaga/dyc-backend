-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('abierto', 'cerrado');

-- CreateEnum
CREATE TYPE "EstadoAsistencia" AS ENUM ('presente', 'tardio', 'falta_injustificada', 'falta_justificada');

-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "jornadaFin" TEXT,
ADD COLUMN     "jornadaInicio" TEXT,
ADD COLUMN     "residenteId" TEXT,
ADD COLUMN     "toleranciaMinutos" INTEGER DEFAULT 10;

-- CreateTable
CREATE TABLE "turnos" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "EstadoTurno" NOT NULL DEFAULT 'abierto',
    "horaAperturaReal" TIMESTAMP(3) NOT NULL,
    "horaCierreReal" TIMESTAMP(3),
    "fotoUrl" TEXT,
    "abiertoPorId" TEXT NOT NULL,
    "cerradoPorId" TEXT,
    "corregidoPorId" TEXT,
    "corregidoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asistencias" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "estado" "EstadoAsistencia" NOT NULL,
    "horaLlegadaReal" TEXT,
    "justificacion" TEXT,
    "horasNormales" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "horasExtra" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pagarExtra" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "turnos_proyectoId_fecha_key" ON "turnos"("proyectoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "asistencias_turnoId_trabajadorId_key" ON "asistencias"("turnoId", "trabajadorId");

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "trabajadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_abiertoPorId_fkey" FOREIGN KEY ("abiertoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_corregidoPorId_fkey" FOREIGN KEY ("corregidoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "turnos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

