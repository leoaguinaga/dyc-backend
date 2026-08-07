-- CreateEnum
CREATE TYPE "DestinoPago" AS ENUM ('empresa', 'trabajador');

-- CreateEnum
CREATE TYPE "MetodoPagoTrabajador" AS ENUM ('registrado', 'transferencia', 'yape', 'plin');

-- AlterEnum
ALTER TYPE "EstadoAprobacionCompra" ADD VALUE 'aprobada_tecnico';

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'compra_simple_pendiente_gerencia';

-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "destinoPago" "DestinoPago",
ADD COLUMN     "pagoBanco" TEXT,
ADD COLUMN     "pagoMetodo" "MetodoPagoTrabajador",
ADD COLUMN     "pagoNumeroCuenta" TEXT,
ADD COLUMN     "pagoRazonSocial" TEXT,
ADD COLUMN     "pagoTrabajadorBanco" TEXT,
ADD COLUMN     "pagoTrabajadorId" TEXT,
ADD COLUMN     "pagoTrabajadorNumero" TEXT,
ADD COLUMN     "pagoTrabajadorNumeroCuenta" TEXT;

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "beneficiarioTrabajadorId" TEXT;

-- CreateTable
CREATE TABLE "compra_simple_grupo_archivos" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "subidoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compra_simple_grupo_archivos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_pagoTrabajadorId_fkey" FOREIGN KEY ("pagoTrabajadorId") REFERENCES "trabajadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_simple_grupo_archivos" ADD CONSTRAINT "compra_simple_grupo_archivos_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_simple_grupo_archivos" ADD CONSTRAINT "compra_simple_grupo_archivos_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_beneficiarioTrabajadorId_fkey" FOREIGN KEY ("beneficiarioTrabajadorId") REFERENCES "trabajadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

