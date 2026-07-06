-- RenameEnumValue
ALTER TYPE "EstadoRequerimiento" RENAME VALUE 'rechazado' TO 'observado';

-- CreateTable
CREATE TABLE "requerimiento_historial" (
    "id" TEXT NOT NULL,
    "requerimientoId" TEXT NOT NULL,
    "estado" "EstadoRequerimiento" NOT NULL,
    "nota" TEXT,
    "actorId" TEXT,
    "actorRole" "Role",
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requerimiento_historial_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "requerimiento_historial" ADD CONSTRAINT "requerimiento_historial_requerimientoId_fkey" FOREIGN KEY ("requerimientoId") REFERENCES "requerimientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requerimiento_historial" ADD CONSTRAINT "requerimiento_historial_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
