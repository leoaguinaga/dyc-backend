-- CreateEnum
CREATE TYPE "NivelAccesoModulo" AS ENUM ('ninguno', 'ver', 'editar');

-- CreateTable
CREATE TABLE "modulo_accesos" (
    "id" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "role" "Role",
    "userId" TEXT,
    "nivel" "NivelAccesoModulo" NOT NULL,
    "actualizadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modulo_accesos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modulo_accesos_userId_idx" ON "modulo_accesos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "modulo_accesos_modulo_role_key" ON "modulo_accesos"("modulo", "role");

-- CreateIndex
CREATE UNIQUE INDEX "modulo_accesos_modulo_userId_key" ON "modulo_accesos"("modulo", "userId");

-- AddForeignKey
ALTER TABLE "modulo_accesos" ADD CONSTRAINT "modulo_accesos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo_accesos" ADD CONSTRAINT "modulo_accesos_actualizadoPorId_fkey" FOREIGN KEY ("actualizadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Una excepción es de un rol o de un usuario, nunca de ambos ni de ninguno.
ALTER TABLE "modulo_accesos" ADD CONSTRAINT "modulo_accesos_rol_o_usuario_check"
  CHECK (("role" IS NULL) <> ("userId" IS NULL));
