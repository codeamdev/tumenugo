-- Add display_code column to orders (human-readable daily consecutive code)
-- Format: PED-001 (table/bar) | DOM-001 (delivery)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS display_code TEXT;
