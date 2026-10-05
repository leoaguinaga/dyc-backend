-- CreateTable
CREATE TABLE "reportes_guardados" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "query" JSONB NOT NULL,
    "compartido" BOOLEAN NOT NULL DEFAULT false,
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reportes_guardados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reportes_guardados_creadoPorId_idx" ON "reportes_guardados"("creadoPorId");

-- AddForeignKey
ALTER TABLE "reportes_guardados" ADD CONSTRAINT "reportes_guardados_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

