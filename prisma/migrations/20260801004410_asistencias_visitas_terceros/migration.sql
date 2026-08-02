-- CreateEnum
CREATE TYPE "TipoVisita" AS ENUM ('staff', 'staff_oficina');

-- CreateTable
CREATE TABLE "registros_visita" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "TipoVisita" NOT NULL,
    "trabajadorId" TEXT,
    "userId" TEXT,
    "nombreLibre" TEXT,
    "motivo" TEXT,
    "horaEntrada" TIMESTAMP(3) NOT NULL,
    "horaSalida" TIMESTAMP(3),
    "registradoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_visita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitas_tercero" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "empresaNombre" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitas_tercero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitantes_tercero" (
    "id" TEXT NOT NULL,
    "visitaTerceroId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "horaEntrada" TIMESTAMP(3) NOT NULL,
    "horaSalida" TIMESTAMP(3),

    CONSTRAINT "visitantes_tercero_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "registros_visita" ADD CONSTRAINT "registros_visita_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_visita" ADD CONSTRAINT "registros_visita_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "trabajadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_visita" ADD CONSTRAINT "registros_visita_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_visita" ADD CONSTRAINT "registros_visita_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas_tercero" ADD CONSTRAINT "visitas_tercero_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas_tercero" ADD CONSTRAINT "visitas_tercero_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitantes_tercero" ADD CONSTRAINT "visitantes_tercero_visitaTerceroId_fkey" FOREIGN KEY ("visitaTerceroId") REFERENCES "visitas_tercero"("id") ON DELETE CASCADE ON UPDATE CASCADE;

