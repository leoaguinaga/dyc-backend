-- CreateTable
CREATE TABLE "help_videos" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "youtubeId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "roles" "Role"[],
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_videos_modulo_idx" ON "help_videos"("modulo");

-- AddForeignKey
ALTER TABLE "help_videos" ADD CONSTRAINT "help_videos_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
