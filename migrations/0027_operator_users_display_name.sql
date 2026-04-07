-- Add optional display name to operator users (first/last name or any freeform name).
ALTER TABLE operator_users ADD COLUMN IF NOT EXISTS display_name TEXT;
