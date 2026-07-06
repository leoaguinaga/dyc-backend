-- AlterTable: remove single-contact fields from proveedores
ALTER TABLE "proveedores" DROP COLUMN IF EXISTS "contacto";
ALTER TABLE "proveedores" DROP COLUMN IF EXISTS "telefono";
ALTER TABLE "proveedores" DROP COLUMN IF EXISTS "email";

-- CreateTable: contactos_proveedores
CREATE TABLE "contactos_proveedores" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "proveedorId" TEXT NOT NULL,

    CONSTRAINT "contactos_proveedores_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "contactos_proveedores" ADD CONSTRAINT "contactos_proveedores_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
