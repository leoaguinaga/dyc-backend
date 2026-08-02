-- CreateEnum
CREATE TYPE "CategoriaObrero" AS ENUM ('operario', 'oficial', 'peon');

-- CreateTable
CREATE TABLE "perfiles_obrero" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "categoria" "CategoriaObrero",
    "precioHora" DECIMAL(10,2),
    "tipoSangre" TEXT,
    "contactoEmergenciaNombre" TEXT,
    "contactoEmergenciaTelefono" TEXT,
    "direccion" TEXT,
    "tallaUniforme" TEXT,
    "tallaCalzado" TEXT,
    "numeroSctr" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfiles_obrero_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_obrero_trabajadorId_key" ON "perfiles_obrero"("trabajadorId");

-- AddForeignKey
ALTER TABLE "perfiles_obrero" ADD CONSTRAINT "perfiles_obrero_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "trabajadores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
