CREATE TABLE "permissions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE TABLE "role_permissions" (
  "role" "Role" NOT NULL,
  "permissionId" TEXT NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role", "permissionId"),
  CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

INSERT INTO "permissions" ("id", "code", "description", "actualizadoEn")
VALUES ('rbac_users_manage', 'users.manage', 'Gestionar usuarios y contraseñas', CURRENT_TIMESTAMP);
INSERT INTO "role_permissions" ("role", "permissionId") VALUES
  ('administrador', 'rbac_users_manage'),
  ('gerencia', 'rbac_users_manage');
