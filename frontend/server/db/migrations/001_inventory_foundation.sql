CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NOT NULL UNIQUE,
  base_unit text NOT NULL CHECK (base_unit IN ('g', 'kg', 'ml', 'l', 'pcs')),
  minimum_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  lot_code text,
  received_quantity numeric(14,3) NOT NULL CHECK (received_quantity > 0),
  remaining_quantity numeric(14,3) NOT NULL CHECK (remaining_quantity >= 0),
  base_unit text NOT NULL CHECK (base_unit IN ('g', 'kg', 'ml', 'l', 'pcs')),
  received_at date NOT NULL,
  expiry_date date,
  container_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expiry_date IS NULL OR expiry_date >= received_at)
);

CREATE TABLE inventory_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  inventory_lot_id uuid REFERENCES inventory_lots(id),
  movement_type text NOT NULL CHECK (movement_type IN ('RECEIVE', 'ADJUSTMENT')),
  quantity numeric(14,3) NOT NULL CHECK (quantity <> 0),
  unit text NOT NULL CHECK (unit IN ('g', 'kg', 'ml', 'l', 'pcs')),
  reference_type text,
  reference_id text,
  reason text,
  actor_staff_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_lots_item_idx ON inventory_lots (inventory_item_id);
CREATE INDEX inventory_lots_expiry_idx ON inventory_lots (expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX inventory_movements_item_idx ON inventory_stock_movements (inventory_item_id, created_at);
CREATE INDEX inventory_movements_lot_idx ON inventory_stock_movements (inventory_lot_id) WHERE inventory_lot_id IS NOT NULL;
