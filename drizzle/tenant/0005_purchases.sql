CREATE TABLE purchase_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'unidad',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_product_id UUID REFERENCES purchase_products(id),
  product_name TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  description TEXT,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registered_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
