-- ─── user_tenant_map ─────────────────────────────────────────────────────────
-- Maps each user email to the tenant they belong to (public schema).
-- Enables email-based tenant discovery for mobile clients.

CREATE TABLE IF NOT EXISTS public.user_tenant_map (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT NOW(),
  CONSTRAINT  user_tenant_map_email_tenant_unique UNIQUE (email, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tenant_map_email ON public.user_tenant_map (email);

-- ─── Backfill from all active tenant schemas ──────────────────────────────────
-- Reads every tenant's users table and inserts the email→tenant mapping.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT id, schema_name
    FROM   public.tenants
    WHERE  status = 'active'
  LOOP
    BEGIN
      EXECUTE format(
        'INSERT INTO public.user_tenant_map (email, tenant_id)
         SELECT LOWER(email), %L
         FROM   %I.users
         WHERE  is_active = true
         ON CONFLICT (email, tenant_id) DO NOTHING',
        t.id,
        t.schema_name
      );
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Backfill failed for schema %: %', t.schema_name, SQLERRM;
    END;
  END LOOP;
END;
$$;
