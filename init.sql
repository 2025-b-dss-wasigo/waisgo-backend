-- =========================
-- EXTENSIONES (UUID) - ¡ESTO VA PRIMERO!
-- =========================
-- Instalamos la extensión como Superusuario para que esté disponible globalmente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- SCHEMAS
-- =========================
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS business;
CREATE SCHEMA IF NOT EXISTS audit;

-- =========================
-- ROLES
-- =========================
-- Usamos DO block para evitar error si ya existen
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'wasigo_app') THEN
    CREATE ROLE wasigo_app LOGIN PASSWORD 'wasigo_app_pwd';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'wasigo_migrator') THEN
    CREATE ROLE wasigo_migrator LOGIN PASSWORD 'wasigo_migrator_pwd';
  END IF;
END
$$;

-- =========================
-- PERMISOS DATABASE
-- =========================

GRANT CONNECT ON DATABASE wasigo TO wasigo_app, wasigo_migrator;

-- =========================
-- PERMISOS PUBLIC (CRÍTICO PARA UUID)
-- =========================
GRANT USAGE ON SCHEMA public TO wasigo_app, wasigo_migrator;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO wasigo_app, wasigo_migrator;
GRANT CREATE ON SCHEMA public TO wasigo_migrator;

-- =========================
-- PERMISOS SCHEMAS & SEQUENCIAS
-- =========================

-- AUTH
GRANT USAGE ON SCHEMA auth TO wasigo_app;
GRANT USAGE, CREATE ON SCHEMA auth TO wasigo_migrator;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO wasigo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO wasigo_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO wasigo_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO wasigo_migrator;

-- BUSINESS
GRANT USAGE ON SCHEMA business TO wasigo_app;
GRANT USAGE, CREATE ON SCHEMA business TO wasigo_migrator;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA business TO wasigo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA business TO wasigo_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA business TO wasigo_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA business TO wasigo_migrator;

-- AUDIT (Solo Insert para la App)
GRANT USAGE ON SCHEMA audit TO wasigo_app;
GRANT USAGE, CREATE ON SCHEMA audit TO wasigo_migrator;

GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit TO wasigo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO wasigo_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA audit TO wasigo_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA audit TO wasigo_migrator;

-- PUBLIC (NECESARIO PARA TYPEORM MIGRATIONS TABLE)
-- TypeORM guarda su historial en public.migrations, así que el migrador necesita permiso aquí.
GRANT USAGE, CREATE ON SCHEMA public TO wasigo_migrator;

-- =========================
-- DEFAULT PRIVILEGES (EL FIX MAESTRO)
-- =========================
-- Esto garantiza que las tablas nuevas creadas por el Migrador sean accesibles por la App

ALTER DEFAULT PRIVILEGES FOR ROLE wasigo_migrator IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wasigo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE wasigo_migrator IN SCHEMA auth GRANT USAGE, SELECT ON SEQUENCES TO wasigo_app;

ALTER DEFAULT PRIVILEGES FOR ROLE wasigo_migrator IN SCHEMA business GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wasigo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE wasigo_migrator IN SCHEMA business GRANT USAGE, SELECT ON SEQUENCES TO wasigo_app;

ALTER DEFAULT PRIVILEGES FOR ROLE wasigo_migrator IN SCHEMA audit GRANT INSERT ON TABLES TO wasigo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE wasigo_migrator IN SCHEMA audit GRANT USAGE, SELECT ON SEQUENCES TO wasigo_app;

-- AUDIT (CORREGIDO: INSERT + SELECT)
-- Esto soluciona el error "permission denied" al hacer INSERT RETURNING
ALTER DEFAULT PRIVILEGES FOR ROLE wasigo_migrator IN SCHEMA audit 
GRANT SELECT, INSERT ON TABLES TO wasigo_app; 

ALTER DEFAULT PRIVILEGES FOR ROLE wasigo_migrator IN SCHEMA audit 
GRANT USAGE, SELECT ON SEQUENCES TO wasigo_app;

  -- =========================
  -- HARDENING
  -- =========================
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  REVOKE ALL ON DATABASE wasigo FROM PUBLIC;