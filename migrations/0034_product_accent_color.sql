-- DEFERRED-21 U-06: per-product accent colour for sidebar visual identity.
-- Stored as a CSS hex string (e.g. '#6366f1').
-- Default is indigo-500 to match the current brand colour.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#6366f1';
