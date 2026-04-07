-- Migration: 0001_init
-- Purpose: Enable required PostgreSQL extensions for NestFleet.
--          pgvector: vector similarity search for product memory (ADR-006)
--          uuid-ossp: uuid_generate_v4() for primary keys

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
