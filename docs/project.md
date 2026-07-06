# Backend — Sistema Interno Díaz y Castillo

## Contexto del proyecto

El sistema interno de Díaz y Castillo (DyC) es un ERP modular desarrollado a medida para digitalizar el proceso de cotizaciones de compra y servicios en obras de construcción. El punto de partida es el módulo de Cotizaciones, que cubre el flujo completo desde que un supervisor solicita un material hasta que se genera la orden de compra (OC) o de servicio (OS).

El sistema está diseñado para crecer por módulos sin reescrituras. La base de datos evoluciona de forma progresiva sprint a sprint, añadiendo tablas y relaciones según el módulo que se implemente.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | NestJS — arquitectura modular |
| Frontend | Next.js — SSR/SSG |
| Base de datos | PostgreSQL |
| Autenticación | better-auth |
| Archivos | Almacenados en el servidor (VPS) |
| Infraestructura | VPS Linux (mínimo 4 GB RAM / 80 GB SSD recomendado) |

---

## Arquitectura

El backend sigue una **arquitectura modular con bajo acoplamiento**. Cada módulo de negocio (Cotizaciones, Almacenes, Obras, Trabajadores, Proveedores) es una unidad independiente dentro del monolito NestJS. La comunicación entre módulos se hace por **eventos internos**, lo que permite extraer cualquier módulo a un microservicio en el futuro sin romper el resto.

### Principios de diseño

- **Un módulo, una responsabilidad.** Cada módulo expone sus propios controladores, servicios y repositorios. No accede directamente a la base de datos de otro módulo.
- **RBAC obligatorio en cada endpoint.** Ningún endpoint es accesible sin verificar el rol del usuario. Se implementa como guard global en NestJS.
- **Auditoría universal.** Cualquier cambio de estado relevante registra: usuario, timestamp, IP de origen y diff de valores. Esto aplica especialmente al flujo de cotizaciones.
- **Eventos para efectos secundarios.** Acciones como enviar un email o registrar en bitácora se disparan por eventos, no en el flujo principal del controlador.

---

## Autenticación y roles

La gestión de sesiones, tokens y usuarios está delegada a **better-auth**. No se implementa auth propio.

Better-auth maneja:
- Registro e inicio de sesión
- JWT con refresh token
- Sesiones
- Vinculación de usuario con rol

Los roles del sistema están **estrechamente acoplados al modelo de usuario de better-auth**. Cada usuario tiene exactamente un rol, y ese rol determina qué módulos y endpoints puede usar.

### Roles definidos

| Rol | Responsabilidad principal |
|---|---|
| `supervisor` | Crea requerimientos de compra para su obra asignada |
| `logistica` | Verifica disponibilidad en almacenes, gestiona proveedores y cotizaciones |
| `gerencia` | Aprueba o rechaza cotizaciones con resumen ejecutivo |
| `administrador` | Genera OC/OS, administra usuarios, obras, trabajadores y reportes |

> Un trabajador de la empresa puede o no tener una cuenta en el sistema. La vinculación entre la entidad `trabajador` y la cuenta de usuario de better-auth es opcional.

---

## Módulos del sistema

### Cotizaciones *(módulo principal)*
Cubre el flujo completo de compra: desde el requerimiento del supervisor hasta la generación de la OC/OS. Es el módulo más complejo e incluye una máquina de estados explícita:

```
Borrador → Solicitado → Cotizando → Comparativo
→ Revisión Supervisor → Aprobación Gerencia
→ Aprobado → OC Generada → Cerrado / Rechazado
```

Cada transición queda registrada en una bitácora inmutable (usuario, timestamp, IP, diff).

### Almacenes
Gestiona los espacios físicos donde la empresa guarda materiales. Existen dos tipos: **almacenes fijos** (Sede 1 y Sede 2, creados como datos seed) y **almacenes de obra** (creados automáticamente al registrar una obra). Cada almacén mantiene un registro liviano de qué hay y en qué cantidad, sin historial de movimientos. Logística consulta esta información al revisar un requerimiento para decidir si se atiende desde almacén o se cotiza con proveedores externos.

### Obras
Registro de las obras activas de la empresa. Los requerimientos de cotización siempre están asociados a una obra. Un supervisor solo puede operar sobre las obras que tiene asignadas.

### Trabajadores
Registro del personal de la empresa. Permite vincular trabajadores a obras con fechas de ingreso y salida. Opcionalmente se vincula a una cuenta de usuario del sistema.

### Proveedores
Registro de empresas proveedoras con su información de contacto, catálogo de productos/servicios y precios referenciales. El historial de cotizaciones se alimenta automáticamente del flujo de Cotizaciones.

### Sistema (transversal)
- **Usuarios y roles:** administrado vía better-auth + capa de roles propia.
- **Reportes:** consultas filtrables por módulo con exportación a Excel y PDF.
- **Notificaciones:** emails transaccionales enviados en cada transición del flujo de cotización.

---

## Evolución progresiva de la base de datos

La base de datos crece sprint a sprint. Cada sprint introduce las tablas del módulo que se implementa en esa semana.

| Sprint | Tablas que se agregan |
|---|---|
| S1 ✅ | Modelo de datos completo diseñado (sin migrar aún) |
| S2 | `users` (better-auth), `roles`, `obras`, `trabajadores`, `proveedores` |
| S3 | `warehouses`, `warehouse_stock`, `proveedor_catalogo` |
| S4 | `requerimientos`, `cotizaciones`, `cotizacion_items`, `cotizacion_bitacora` |
| S5 | `ordenes_compra`, `ordenes_compra_items`, cierre de obra, reportes |

> Las migraciones se gestionan con las herramientas nativas de NestJS + TypeORM (o Prisma, según se defina en S2). Cada migración debe ser reversible.

---

## Seguridad

- **JWT con refresh token** gestionado por better-auth.
- **bcrypt** con cost ≥ 12 para contraseñas.
- **RBAC** aplicado como guard en cada endpoint — ningún controlador es público por defecto.
- **Helmet** para headers HTTP seguros.
- **Rate limiting** en endpoints de autenticación y operaciones críticas.
- **HTTPS** obligatorio en todos los entornos (incluyendo desarrollo con certificado local).
- Toda acción sobre datos sensibles registra usuario + IP.

---

## Criterios de calidad

- Cobertura de tests ≥ 70% en lógica de dominio (servicios y casos de uso).
- Linting estricto (ESLint + Prettier) configurado desde el inicio.
- ADRs (Architecture Decision Records) documentados para decisiones relevantes.
- Endpoints CRUD < 500ms p95 con hasta 10k cotizaciones en BD.
- Carga del cuadro comparativo < 1.5s.

---

## Convenciones de desarrollo

- **Ramas:** una rama por sprint (`sprint/s2-fundaciones`, etc.). Se mergea a `main` al finalizar el sprint con la demo del jueves.
- **Commits:** convencional commits (`feat:`, `fix:`, `chore:`, `migration:`).
- **Migraciones:** nunca se edita una migración ya commiteada. Si hay un error, se crea una nueva migración correctiva.
- **Variables de entorno:** ninguna credencial en el repositorio. Usar `.env.example` como referencia.
- **Archivos:** PDFs, imágenes y adjuntos se almacenan en el servidor bajo una ruta estructurada por módulo y fecha. No se usan servicios externos de storage en el MVP.

---

## Presentaciones de sprint

Cada jueves se presenta el avance del sprint con el flujo funcionando end-to-end en el entorno de desarrollo. La retroalimentación se registra como issues para el siguiente sprint.

---

*Última actualización: S1 completado — 05 Jun 2026*