-- Migration: 0033_product_slug
-- Purpose: Add `slug` column to products for URL-based multi-product routing (DEFERRED-21).
--
-- Safe 3-step approach:
--   1. Add as nullable (existing rows would violate NOT NULL immediately)
--   2. Backfill all existing rows before enforcing the constraint
--   3. Set NOT NULL + UNIQUE

-- Step 1: nullable column
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug TEXT;

-- Step 2: backfill — derive slug from name (lowercase, non-alphanumeric → hyphen, trimmed)
UPDATE products
SET slug = LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Step 3: enforce constraints
ALTER TABLE products ALTER COLUMN slug SET NOT NULL;
ALTER TABLE products ADD CONSTRAINT products_slug_unique UNIQUE (slug);
CREATE INDEX IF NOT EXISTS products_slug_idx ON products (slug);
