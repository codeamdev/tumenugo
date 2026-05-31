-- ─── system_config ────────────────────────────────────────────────────────────
-- Configuración global del sistema (fila única garantizada por CHECK).
-- default_tenant_slug: tenant usado cuando no hay subdominio en la URL (Fase 1).

CREATE TABLE IF NOT EXISTS public.system_config (
  id                    INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_tenant_slug   TEXT        NOT NULL DEFAULT '',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.system_config (id, default_tenant_slug)
VALUES (1, '')
ON CONFLICT DO NOTHING;
