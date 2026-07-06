-- ============================================================
-- DOMAIN: AUTH EXTENSION
-- ============================================================

CREATE TABLE user_roles (
  user_id  TEXT        NOT NULL,  -- Better Auth user.id
  role     VARCHAR(50) NOT NULL,
  -- valid roles:
  -- 'supervisor_electrico' | 'supervisor_civil' | 'residente'
  -- 'pdr_seguridad' | 'logistica' | 'asist_logistica'
  -- 'ing_electrico' | 'ing_civil' | 'jefe_sig'
  -- 'asist_admin' | 'administrador'
  -- 'gerente_general' | 'gerente_operaciones' | 'director_proyecto'
  PRIMARY KEY (user_id, role)
);

-- ============================================================
-- DOMAIN: HR
-- ============================================================

CREATE TABLE workers (
  id                  SERIAL PRIMARY KEY,
  -- identity
  name                VARCHAR(100) NOT NULL,
  dni                 VARCHAR(8)   NOT NULL UNIQUE,
  birth_date          DATE,
  -- position
  position            VARCHAR(100),
  specialty           VARCHAR(100),
  phone               VARCHAR(20),
  email               VARCHAR(150),
  -- health & safety (optional, mainly for field workers)
  blood_type          VARCHAR(5)
                      CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  allergies           TEXT,
  medical_notes       TEXT,
  -- emergency contact
  emergency_name      VARCHAR(100),
  emergency_phone     VARCHAR(20),
  emergency_relation  VARCHAR(50),
  -- system link
  user_id             TEXT UNIQUE,  -- Better Auth user.id (optional)
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOMAIN: CLIENTS
-- ============================================================

CREATE TABLE clients (
  id          SERIAL PRIMARY KEY,
  legal_name  VARCHAR(200) NOT NULL,
  ruc         VARCHAR(11)  UNIQUE,
  address     VARCHAR(255),
  city        VARCHAR(100),
  phone       VARCHAR(20),
  email       VARCHAR(150),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_contacts (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER      NOT NULL REFERENCES clients(id),
  name        VARCHAR(100) NOT NULL,
  role        VARCHAR(100),
  phone       VARCHAR(20),
  email       VARCHAR(150),
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOMAIN: PROJECTS
-- ============================================================

CREATE TABLE projects (
  id                       SERIAL PRIMARY KEY,
  code                     VARCHAR(20)  NOT NULL UNIQUE,
  name                     VARCHAR(150) NOT NULL,
  city                     VARCHAR(100),
  address                  VARCHAR(255),
  -- relationships
  client_id                INTEGER NOT NULL REFERENCES clients(id),
  client_coordinator_id    INTEGER REFERENCES client_contacts(id),
  company_coordinator_id   INTEGER REFERENCES workers(id),
  executor_id              INTEGER REFERENCES workers(id),
  safety_officer_id        INTEGER REFERENCES workers(id),
  -- dates
  planned_start            DATE,
  planned_end              DATE,
  actual_start             DATE,
  actual_end               DATE,
  -- status & closure
  service_status           VARCHAR(50),
  has_penalty              BOOLEAN NOT NULL DEFAULT false,
  penalty_amount           NUMERIC(12,2),
  conformity_doc_path      VARCHAR(500),
  satisfaction_survey_path VARCHAR(500),
  notes                    TEXT,
  status                   VARCHAR(20) NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused', 'closed')),
  total_spent              NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_supervisors (
  project_id    INTEGER NOT NULL REFERENCES projects(id),
  worker_id     INTEGER NOT NULL REFERENCES workers(id),
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (project_id, worker_id)
);

CREATE TABLE project_staff (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id),
  worker_id   INTEGER NOT NULL REFERENCES workers(id),
  joined_date DATE NOT NULL,
  left_date   DATE,
  UNIQUE (project_id, worker_id, joined_date)
);

CREATE TABLE work_certificates (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id),
  worker_id   INTEGER NOT NULL REFERENCES workers(id),
  issued_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  file_path   VARCHAR(500),
  issued_by   TEXT        NOT NULL,  -- Better Auth user.id
  UNIQUE (project_id, worker_id)
);

-- ============================================================
-- DOMAIN: SUPPLIERS
-- ============================================================

CREATE TABLE suppliers (
  id             SERIAL PRIMARY KEY,
  legal_name     VARCHAR(200) NOT NULL,
  ruc            VARCHAR(11)  NOT NULL UNIQUE,
  address        VARCHAR(255),
  phone          VARCHAR(20),
  contact_email  VARCHAR(150),
  payment_terms  VARCHAR(255),
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE supplier_categories (
  supplier_id  INTEGER      NOT NULL REFERENCES suppliers(id),
  category     VARCHAR(100) NOT NULL,
  PRIMARY KEY (supplier_id, category)
);

-- ============================================================
-- DOMAIN: PRODUCT CATALOG
-- ============================================================

CREATE TABLE products (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(50)  NOT NULL UNIQUE,
  canonical_name  VARCHAR(255) NOT NULL,
  unit            VARCHAR(50)  NOT NULL,
  category        VARCHAR(100),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE supplier_products (
  id               SERIAL PRIMARY KEY,
  supplier_id      INTEGER      NOT NULL REFERENCES suppliers(id),
  product_id       INTEGER      NOT NULL REFERENCES products(id),
  supplier_name    VARCHAR(255) NOT NULL,
  reference_price  NUMERIC(12,2),
  last_updated     DATE,
  active           BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (supplier_id, product_id)
);

CREATE TABLE supplier_product_prices (
  id                  SERIAL PRIMARY KEY,
  supplier_product_id INTEGER NOT NULL REFERENCES supplier_products(id),
  price               NUMERIC(12,2) NOT NULL,
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  source              VARCHAR(20) CHECK (source IN ('manual', 'quotation')),
  quotation_id        INTEGER  -- FK resolved after quotations via ALTER
);

CREATE TABLE supplier_scores (
  id               SERIAL PRIMARY KEY,
  supplier_id      INTEGER NOT NULL REFERENCES suppliers(id),
  price_score      NUMERIC(4,2),
  deadline_score   NUMERIC(4,2),
  quality_score    NUMERIC(4,2),
  composite_score  NUMERIC(4,2),
  period           VARCHAR(20),
  calculated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOMAIN: WAREHOUSES
-- Reemplaza el dominio INVENTORY.
-- Dos tipos:
--   'fixed'   → sedes permanentes de la empresa (Sede 1, Sede 2)
--   'project' → almacén temporal creado junto con cada obra
--
-- warehouse_stock es intencional mente liviano: no hay movimientos,
-- solo un snapshot de qué hay y dónde. product_id es opcional para
-- permitir registros informales sin pasar por el catálogo.
-- ============================================================

CREATE TABLE warehouses (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(20)  NOT NULL CHECK (type IN ('fixed', 'project')),
  project_id  INTEGER REFERENCES projects(id),  -- requerido si type = 'project'
  location    VARCHAR(255),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_warehouse
    CHECK (type != 'project' OR project_id IS NOT NULL)
);

-- Almacenes fijos (seed data):
-- INSERT INTO warehouses (name, type) VALUES ('Sede 1', 'fixed');
-- INSERT INTO warehouses (name, type) VALUES ('Sede 2', 'fixed');
-- Almacén de obra: INSERT desde la aplicación al crear cada proyecto.

CREATE TABLE warehouse_stock (
  id            SERIAL PRIMARY KEY,
  warehouse_id  INTEGER       NOT NULL REFERENCES warehouses(id),
  product_id    INTEGER       REFERENCES products(id),   -- opcional
  description   VARCHAR(255)  NOT NULL,                  -- siempre requerido
  unit          VARCHAR(50)   NOT NULL,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 0,
  notes         TEXT,
  updated_by    TEXT          NOT NULL,                  -- Better Auth user.id
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOMAIN: PURCHASE REQUESTS
-- ============================================================

CREATE TABLE requests (
  id                   SERIAL PRIMARY KEY,
  number               VARCHAR(20) NOT NULL UNIQUE,  -- REQ-2026-0001
  project_id           INTEGER NOT NULL REFERENCES projects(id),
  requested_by         TEXT NOT NULL,                -- Better Auth user.id
  urgency              VARCHAR(20) NOT NULL DEFAULT 'normal'
                       CHECK (urgency IN ('normal', 'urgent', 'critical')),
  category             VARCHAR(30)
                       CHECK (category IN ('electrical', 'civil', 'safety', 'other')),
  status               VARCHAR(30) NOT NULL DEFAULT 'draft'
                       CHECK (status IN (
                         'draft',
                         'pending_technical_review',
                         'returned',
                         'technical_approved',
                         'pending_logistics',
                         'fulfilled_from_warehouse',
                         'pending_quotation',
                         'pending_approval',
                         'approved',
                         'rejected',
                         'cancelled'
                       )),
  reviewer_id          TEXT,                         -- Better Auth user.id
  reviewed_at          TIMESTAMPTZ,
  review_notes         TEXT,
  logistics_user_id    TEXT,                         -- Better Auth user.id
  logistics_checked_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE request_items (
  id                  SERIAL PRIMARY KEY,
  request_id          INTEGER       NOT NULL REFERENCES requests(id),
  product_id          INTEGER       REFERENCES products(id),
  free_description    VARCHAR(255)  NOT NULL,
  quantity            NUMERIC(12,3) NOT NULL,
  unit                VARCHAR(50)   NOT NULL,
  warehouse_source_id INTEGER       REFERENCES warehouses(id)  -- NULL = va a compra
);

CREATE TABLE request_logs (
  id              SERIAL PRIMARY KEY,
  request_id      INTEGER     NOT NULL REFERENCES requests(id),
  previous_status VARCHAR(30),
  new_status      VARCHAR(30) NOT NULL,
  user_id         TEXT        NOT NULL,  -- Better Auth user.id
  ip              VARCHAR(45),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOMAIN: QUOTATIONS
-- ============================================================

CREATE TABLE quotation_requests (
  id          SERIAL PRIMARY KEY,
  request_id  INTEGER NOT NULL REFERENCES requests(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  sent_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_by     TEXT NOT NULL,  -- Better Auth user.id
  email_sent  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (request_id, supplier_id)
);

CREATE TABLE quotations (
  id              SERIAL PRIMARY KEY,
  request_id      INTEGER       NOT NULL REFERENCES requests(id),
  supplier_id     INTEGER       NOT NULL REFERENCES suppliers(id),
  unit_price      NUMERIC(12,2) NOT NULL,
  total_price     NUMERIC(14,2) NOT NULL,
  delivery_days   INTEGER,
  payment_terms   VARCHAR(255),
  notes           TEXT,
  file_path       VARCHAR(500),
  registered_by   TEXT NOT NULL,  -- Better Auth user.id
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, supplier_id)
);

ALTER TABLE supplier_product_prices
  ADD CONSTRAINT fk_quotation
  FOREIGN KEY (quotation_id) REFERENCES quotations(id);

CREATE TABLE comparison_tables (
  id                   SERIAL PRIMARY KEY,
  request_id           INTEGER NOT NULL UNIQUE REFERENCES requests(id),
  winner_supplier_id   INTEGER REFERENCES suppliers(id),
  logistics_notes      TEXT,
  generated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_for_approval_at TIMESTAMPTZ
);

CREATE TABLE comparison_lines (
  id              SERIAL PRIMARY KEY,
  comparison_id   INTEGER       NOT NULL REFERENCES comparison_tables(id),
  quotation_id    INTEGER       NOT NULL REFERENCES quotations(id),
  price_score     NUMERIC(5,2),
  deadline_score  NUMERIC(5,2),
  composite_score NUMERIC(5,2),
  position        INTEGER,
  recommended     BOOLEAN NOT NULL DEFAULT false
);

-- ============================================================
-- DOMAIN: APPROVALS, ORDERS & PAYMENTS
-- ============================================================

CREATE TABLE approvals (
  id          SERIAL PRIMARY KEY,
  request_id  INTEGER     NOT NULL REFERENCES requests(id),
  type        VARCHAR(20) NOT NULL CHECK (type IN ('supervisor', 'management')),
  approved_by TEXT        NOT NULL,  -- Better Auth user.id
  decision    VARCHAR(15) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id           SERIAL PRIMARY KEY,
  number       VARCHAR(20)   NOT NULL UNIQUE,  -- PO-2026-0001 / SO-2026-0001
  type         VARCHAR(10)   NOT NULL CHECK (type IN ('purchase', 'service')),
  request_id   INTEGER       NOT NULL REFERENCES requests(id),
  supplier_id  INTEGER       NOT NULL REFERENCES suppliers(id),
  items        JSONB         NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  cost_center  VARCHAR(100),
  status       VARCHAR(20) NOT NULL DEFAULT 'issued'
               CHECK (status IN ('issued', 'paid', 'voided')),
  file_path    VARCHAR(500),
  created_by   TEXT        NOT NULL,  -- Better Auth user.id
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER       NOT NULL REFERENCES orders(id),
  amount           NUMERIC(14,2) NOT NULL,
  scheduled_date   DATE          NOT NULL,
  executed_date    DATE,
  bank_account     VARCHAR(50),
  bank_reference   VARCHAR(100),
  status           VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'approved', 'executed', 'cancelled')),
  approved_by      TEXT,          -- Better Auth user.id
  registered_by    TEXT NOT NULL, -- Better Auth user.id
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOMAIN: NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id             SERIAL PRIMARY KEY,
  user_id        TEXT        NOT NULL,  -- Better Auth user.id
  type           VARCHAR(50) NOT NULL,
  reference_id   INTEGER,
  reference_type VARCHAR(30),
  message        TEXT,
  read           BOOLEAN NOT NULL DEFAULT false,
  email_sent     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);