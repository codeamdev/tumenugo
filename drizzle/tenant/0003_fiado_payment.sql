-- Agrega el método de pago 'fiado' (pendiente por pagar) al enum.
-- ALTER TYPE ADD VALUE no puede ir dentro de un BEGIN/COMMIT en PG < 12.
-- En PG 12+ se permite dentro de una transacción; el valor es visible tras el commit.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'fiado';
