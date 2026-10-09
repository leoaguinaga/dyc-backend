-- Parte de DATOS de las migraciones 20260710150000..20261009100000 para una base
-- cuyo esquema se sincronizó con `prisma db push`. Idempotente: se puede correr 2 veces.
BEGIN;

-- 20260831090000_pagos_operativos
UPDATE "pagos" p
SET "proyectoId" = oc."proyectoId",
    "concepto" = COALESCE(oc."concepto", prov."razonSocial", oc."proveedorNombreLibre", 'Pago de orden de compra')
FROM "ordenes_compra" oc
LEFT JOIN "proveedores" prov ON prov.id = oc."proveedorId"
WHERE p."ordenCompraId" = oc.id AND p."proyectoId" IS NULL AND p."concepto" IS NULL;

-- 20260831110000_planilla_staff
UPDATE "trabajadores" SET "tipoPersonal" = 'obrero'
WHERE "tipoPersonal" = 'sin_clasificar' AND id IN (SELECT "trabajadorId" FROM "perfiles_obrero");

-- 20260922144743_add_comprobantes_rendicion (necesita pagos."comprobanteUrl"; si la columna ya no existe, omitir)
INSERT INTO "comprobantes" ("id","pagoId","numero","subNumero","tipoDocumento","importe","estado",
  "archivoNombre","archivoUrl","generadoPorId","creadoEn","actualizadoEn")
SELECT 'mig_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), p."id",
  'MIGRADO-' || p."id", 1, 'otro'::"TipoDocumentoComprobante", p."monto",
  CASE WHEN p."estado" = 'pagado' THEN 'cerrado'::"EstadoComprobante" ELSE 'abierto'::"EstadoComprobante" END,
  COALESCE(p."comprobanteNombre", 'Comprobante migrado'), p."comprobanteUrl",
  COALESCE(p."pagadoPorId", p."registradoPorId"), p."creadoEn", p."actualizadoEn"
FROM "pagos" p
WHERE p."comprobanteUrl" IS NOT NULL AND p."comprobanteUrl" <> ''
  AND NOT EXISTS (SELECT 1 FROM "comprobantes" c WHERE c."numero" = 'MIGRADO-' || p."id");

-- 20260929000000_dynamic_rbac
INSERT INTO "permissions" ("id","code","description","actualizadoEn")
VALUES ('rbac_users_manage','users.manage','Gestionar usuarios y contraseñas',CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role","permissionId") VALUES
  ('administrador','rbac_users_manage'),('gerencia','rbac_users_manage')
ON CONFLICT DO NOTHING;

-- 20261006120000_pagos_empresa_rendicion_importacion
INSERT INTO "empresas" ("id","razonSocial","ruc","actualizadoEn")
VALUES ('empresa_dyc','DIAZ & CASTILLO INGENIERÍA Y PROYECTOS SAC','20608745611',CURRENT_TIMESTAMP)
ON CONFLICT ("ruc") DO NOTHING;
UPDATE "pagos" SET "empresaId" = (SELECT "id" FROM "empresas" WHERE "ruc" = '20608745611')
WHERE "empresaId" IS NULL;

-- 20261009100000_requerimiento_prioridad
UPDATE "requerimientos" SET "prioridad" = 'urgente' WHERE "urgente" = true;

COMMIT;
