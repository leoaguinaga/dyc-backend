-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('pago_por_vencer', 'pago_vencido', 'requerimiento_creado', 'requerimiento_aprobado', 'requerimiento_observado', 'cotizacion_recibida', 'solicitud_lista_adjudicar', 'orden_compra_generada');

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "entidadTipo" TEXT,
    "entidadId" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leidaEn" TIMESTAMP(3),
    "emailEnviado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_userId_leida_idx" ON "notificaciones"("userId", "leida");

-- CreateIndex
CREATE INDEX "notificaciones_entidadTipo_entidadId_idx" ON "notificaciones"("entidadTipo", "entidadId");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
