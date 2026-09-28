-- Ejecutar UNA sola vez en postgres_core (como superusuario), antes del primer deploy.
-- Reemplazá 'placeholder_seguro' por la misma contraseña que pongas en DB_PASSWORD del .env.
--
-- Ejemplo:
--   docker exec -i postgres_core psql -U postgres < deploy/init-postgres_core.sql

CREATE ROLE tickets_user WITH LOGIN ENCRYPTED PASSWORD 'placeholder_seguro';
CREATE DATABASE tickets_db OWNER tickets_user;

\c tickets_db
-- Extensiones opcionales (descomentá si las necesitás):
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
