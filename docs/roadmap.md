# Roadmap Backend — Sistema Interno Díaz y Castillo

> **Estado actual:** S2 completado — 09 Jun 2026
> **Convención de ramas:** `sprint/s{N}-{slug}` → merge a `main` cada jueves con demo end-to-end.

---

## Resumen de fases

| Fase | Sprint | Nombre | Estado |
|---|---|---|---|
| 0 | S1 | Diseño y arquitectura base | ✅ Completado |
| 1 | S2 | Fundaciones: auth, usuarios, entidades maestras | ✅ Completado |
| 2 | S3 | Almacenes y catálogo de proveedores | ⬜ Pendiente |
| 3 | S4 | Módulo de cotizaciones y máquina de estados | ⬜ Pendiente |
| 4 | S5 | OC/OS, cierre de obra y reportes base | ⬜ Pendiente |
| 5 | S6+ | Notificaciones, hardening y optimización | ⬜ Post-MVP |

---

## Fase 0 — Diseño y arquitectura base `sprint/s1-arquitectura` ✅

**Objetivo:** Definir el modelo de datos completo, la arquitectura del monolito modular y las convenciones del proyecto antes de escribir código de producción.

### Entregables
- [x] Documento `project.md` con contexto, stack y principios de diseño
- [x] Modelo de datos completo diseñado (sin migrar)
- [x] Definición de roles: `supervisor`, `logistica`, `gerencia`, `administrador`
- [x] Diagrama de máquina de estados del flujo de cotizaciones
- [x] ADR inicial: decisión de ORM (TypeORM vs Prisma)
- [x] Estructura base del monorepo NestJS
- [x] `.env.example` con todas las variables requeridas

---

## Fase 1 — Fundaciones `sprint/s2-fundaciones` ✅

**Objetivo:** Levantar la base de autenticación, el sistema de roles y las entidades maestras del negocio. Al final del sprint, un usuario puede registrarse, autenticarse y se pueden gestionar obras, trabajadores y proveedores vía API.

### Migraciones
- `users` (better-auth)
- `roles`
- `obras`
- `trabajadores`
- `proveedores`

### Tareas de desarrollo

**Auth & Usuarios**
- [x] Integrar `better-auth` en NestJS (registro, login, refresh token)
- [x] Guard global de autenticación (ningún endpoint público por defecto)
- [x] Capa de roles propia vinculada al modelo de usuario de better-auth
- [x] Guard de RBAC por decorador `@Roles(...)`
- [x] Endpoint `GET /me` con perfil y rol del usuario autenticado

**Módulo Obras**
- [x] CRUD completo: `POST /obras`, `GET /obras`, `GET /obras/:id`, `PATCH /obras/:id`
- [x] Asignación de supervisores a obras (`POST /obras/:id/supervisores`)
- [x] Un supervisor solo puede ver sus obras asignadas (filtro por rol en servicio)

**Módulo Trabajadores**
- [x] CRUD completo con vinculación opcional a cuenta de usuario
- [x] Endpoint para asignar/desasignar trabajador de una obra con fecha de ingreso/salida

**Módulo Proveedores**
- [x] CRUD completo: razón social, RUT, contacto, dirección
- [x] Listado con filtros por nombre y estado activo/inactivo

**Infraestructura transversal**
- [x] Helmet + CORS configurados
- [x] Rate limiting en `/auth/*`
- [x] Interceptor de auditoría (usuario + IP en cada mutación)
- [x] Linting: ESLint + Prettier en CI

### Criterios de aceptación
- Login exitoso retorna JWT + refresh token
- Un `supervisor` no puede llamar endpoints de `administrador` (403)
- CRUD de obras, trabajadores y proveedores < 500ms p95

---

## Fase 2 — Almacenes y catálogo `sprint/s3-almacenes` ⬜

**Objetivo:** Gestionar los almacenes de la empresa y el catálogo de productos/servicios por proveedor. Al final del sprint, Logística puede consultar qué hay en cada almacén al revisar un requerimiento, y decidir si se atiende internamente o va a cotización externa.

### Migraciones
- `warehouses`
- `warehouse_stock`
- `proveedor_catalogo`

### Tareas de desarrollo

**Módulo Almacenes**
- [ ] Seed de almacenes fijos al iniciar: Sede 1 y Sede 2 (`type: 'fixed'`)
- [ ] Creación automática de almacén de obra al registrar una nueva obra (`type: 'project'`)
- [ ] `GET /almacenes` — listado con tipo y obra asociada (si aplica)
- [ ] `GET /almacenes/:id/stock` — contenido del almacén con filtros por descripción o producto
- [ ] `POST /almacenes/:id/stock` — registrar o actualizar un ítem en el almacén (descripción libre, unidad, cantidad, notas; `product_id` opcional)
- [ ] `PATCH /almacenes/:id/stock/:itemId` — editar cantidad o notas de un ítem existente
- [ ] Solo roles `logistica` y `administrador` pueden modificar stock

**Módulo Proveedor — Catálogo**
- [ ] Asociar productos/servicios con precio referencial a un proveedor
- [ ] Historial de precios por ítem-proveedor
- [ ] Búsqueda por producto para encontrar proveedores que lo ofrecen

**Infraestructura transversal**
- [ ] Tests unitarios en servicios de almacenes (≥ 70% cobertura)
- [ ] Migración reversible con datos seed para demo (almacenes fijos + stock de ejemplo)

### Criterios de aceptación
- Consulta de stock de un almacén con 200 ítems en < 200ms
- Al crear una obra, su almacén temporal se crea en la misma transacción (o rollback completo)
- Catálogo de proveedor actualizable sin afectar historial de cotizaciones anteriores

---

## Fase 3 — Módulo de cotizaciones `sprint/s4-cotizaciones` ⬜

**Objetivo:** Implementar el flujo completo de cotizaciones con su máquina de estados explícita, bitácora inmutable y roles diferenciados. Es el módulo central del ERP.

### Migraciones
- `requerimientos`
- `cotizaciones`
- `cotizacion_items`
- `cotizacion_bitacora`

### Máquina de estados

```
Borrador → Solicitado → Cotizando → Comparativo
→ Revisión Supervisor → Aprobación Gerencia
→ Aprobado → OC Generada → Cerrado / Rechazado
```

### Tareas de desarrollo

**Requerimientos**
- [ ] `POST /requerimientos` — supervisor crea borrador asociado a su obra
- [ ] Validar que el supervisor solo opera en sus obras asignadas
- [ ] Transición `Borrador → Solicitado` al enviar el requerimiento
- [ ] Adjuntos (imágenes/PDF) almacenados en VPS bajo ruta estructurada por módulo y fecha

**Motor de cotizaciones**
- [ ] Servicio de transiciones: validar rol + estado actual antes de cada cambio
- [ ] `PATCH /cotizaciones/:id/estado` con payload de transición
- [ ] Tabla `cotizacion_bitacora` inmutable — sin UPDATE ni DELETE permitidos
- [ ] Generación de cuadro comparativo al llegar al estado `Comparativo`
- [ ] Al pasar a `fulfilled_from_warehouse`, logística registra `warehouse_source_id` en cada ítem atendido desde almacén

**Roles por transición**

| Transición | Rol requerido |
|---|---|
| Borrador → Solicitado | `supervisor` |
| Solicitado → Cotizando | `logistica` |
| Cotizando → Comparativo | `logistica` |
| Comparativo → Revisión Supervisor | `supervisor` |
| Revisión → Aprobación Gerencia | `gerencia` |
| Aprobación → Aprobado | `gerencia` |
| Rechazado | `gerencia` o `administrador` |

**Infraestructura transversal**
- [ ] Evento interno `cotizacion.estado_cambiado` — desacoplado del controlador
- [ ] Tests de integración sobre el flujo completo de estados
- [ ] Endpoint de historial: `GET /cotizaciones/:id/bitacora`

### Criterios de aceptación
- Ninguna transición de estado se procesa sin registrar en bitácora
- Cuadro comparativo carga en < 1.5s con 500 cotizaciones en BD
- Transición inválida devuelve 422 con mensaje descriptivo

---

## Fase 4 — OC/OS, cierre y reportes base `sprint/s5-oc-reportes` ⬜

**Objetivo:** Generar las órdenes de compra y servicio a partir de cotizaciones aprobadas, cerrar el ciclo de obra y proveer reportes exportables a Excel y PDF.

### Migraciones
- `ordenes_compra`
- `ordenes_compra_items`
- Columna `cerrada_en` + `cerrada_por` en `obras`

### Tareas de desarrollo

**Órdenes de Compra / Servicio**
- [ ] `POST /ordenes-compra` — solo `administrador`, desde cotización en estado `Aprobado`
- [ ] Generar PDF de la OC/OS y almacenar en VPS
- [ ] Transición automática del estado de la cotización a `OC Generada`
- [ ] `GET /ordenes-compra` con filtros por obra, proveedor, fecha y estado

**Cierre de Obra**
- [ ] `PATCH /obras/:id/cerrar` — solo `administrador`
- [ ] Validar que no existan cotizaciones en estado intermedio antes de cerrar
- [ ] Registro de `cerrada_en` y `cerrada_por` en auditoría

**Reportes**
- [ ] `GET /reportes/cotizaciones` — filtros por obra, fecha, estado, proveedor
- [ ] `GET /reportes/almacenes` — stock actual por almacén, con filtros por tipo (fijo/obra) y producto
- [ ] Exportación a Excel (`.xlsx`) y PDF para cada reporte
- [ ] Solo roles `gerencia` y `administrador` acceden a reportes

### Criterios de aceptación
- PDF de OC disponible en < 3s tras la generación
- Reportes con 10k cotizaciones exportan en < 5s

---

## Fase 5 — Notificaciones, hardening y optimización `sprint/s6+` ⬜

**Objetivo:** Completar el sistema transversal de notificaciones, reforzar la seguridad, optimizar performance y preparar el sistema para producción en VPS.

### Notificaciones
- [ ] Email transaccional en cada transición del flujo de cotizaciones
- [ ] Plantillas HTML por tipo de evento (solicitud, aprobación, rechazo, OC generada)
- [ ] Cola de envío desacoplada del flujo principal (evento `cotizacion.estado_cambiado`)
- [ ] Retry automático con backoff exponencial para envíos fallidos
- [ ] Log de notificaciones enviadas/fallidas

### Seguridad y hardening
- [ ] HTTPS obligatorio con certificado válido (incluyendo desarrollo local)
- [ ] Validar bcrypt con cost ≥ 12 en todos los entornos
- [ ] Auditoría de sesiones: invalidar tokens al cambiar contraseña o deshabilitar usuario
- [ ] Test de penetración básico sobre endpoints de auth y cotizaciones
- [ ] Revisión de todos los endpoints para asegurar que RBAC esté aplicado

### Performance
- [ ] Índices en campos de búsqueda frecuente: `estado`, `obra_id`, `created_at`
- [ ] Paginación en todos los listados (cursor o offset según volumen)
- [ ] Cache de cuadro comparativo (TTL corto, invalidar al cambiar estado)
- [ ] Benchmark: CRUD < 500ms p95 con 10k cotizaciones en BD

### Infraestructura de producción
- [ ] Docker Compose para VPS (NestJS + PostgreSQL + reverse proxy)
- [ ] Variables de entorno documentadas en `.env.example`
- [ ] Script de backup automático de PostgreSQL
- [ ] Health check endpoint `GET /health`
- [ ] Logging estructurado (JSON) compatible con herramienta de monitoreo

---

## Dependencias entre fases

```
Fase 0 ──► Fase 1 ──► Fase 2 ──► Fase 3 ──► Fase 4
                                               │
                                               ▼
                                            Fase 5
```

- **Fase 3** requiere que Fase 1 (auth + roles) y Fase 2 (almacenes) estén completas.
- **Fase 4** (OC y reportes) depende directamente del motor de cotizaciones de Fase 3.
- **Fase 5** puede iniciarse en paralelo a Fase 4 para las partes de hardening e infraestructura.

---

## Métricas de calidad por fase

| Métrica | Target |
|---|---|
| Cobertura de tests (servicios) | ≥ 70% |
| Latencia CRUD p95 | < 500ms |
| Carga cuadro comparativo | < 1.5s |
| Exportación de reportes | < 5s |
| Disponibilidad en producción | ≥ 99.5% |

---

*Generado a partir de `project.md` — 09 Jun 2026*