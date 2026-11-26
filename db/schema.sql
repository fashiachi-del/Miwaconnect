-- MiwaConnect Kenya — Neon PostgreSQL schema
--
-- Apply with:  npm run db:setup
-- (or paste this whole file into the Neon SQL editor and run it)
--
-- The schema is idempotent: re-running it will not drop data or overwrite
-- prices that clerks have already updated.

CREATE TABLE IF NOT EXISTS factories (
  factory_id            TEXT PRIMARY KEY,
  factory_name          TEXT NOT NULL,
  location              TEXT NOT NULL,
  price_per_tonne_kes   NUMERIC(12,2) NOT NULL,
  avg_payment_days      INTEGER NOT NULL DEFAULT 14,
  payment_speed_rating  TEXT NOT NULL,
  queue_status          TEXT NOT NULL DEFAULT 'Low',
  transport_rate_0_15km    NUMERIC(12,2) NOT NULL DEFAULT 750,
  transport_rate_16_30km   NUMERIC(12,2) NOT NULL DEFAULT 1050,
  transport_rate_31_plus_km NUMERIC(12,2) NOT NULL DEFAULT 1350,
  last_updated          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Farmer IDs are auto-assigned as F-0001, F-0002, ...
CREATE SEQUENCE IF NOT EXISTS farmer_id_seq;

CREATE TABLE IF NOT EXISTS farmers (
  farmer_id         TEXT PRIMARY KEY
                    DEFAULT 'F-' || LPAD(nextval('farmer_id_seq')::TEXT, 4, '0'),
  full_name         TEXT NOT NULL,
  phone_number      TEXT NOT NULL UNIQUE,
  county_ward       TEXT NOT NULL DEFAULT '',
  plot_size_acres   NUMERIC(8,2) NOT NULL DEFAULT 0,
  contract_status   TEXT NOT NULL DEFAULT 'Private / Independent',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Booking IDs are auto-assigned as BK-0001, BK-0002, ...
CREATE SEQUENCE IF NOT EXISTS booking_id_seq;

CREATE TABLE IF NOT EXISTS harvest_bookings (
  booking_id            TEXT PRIMARY KEY
                        DEFAULT 'BK-' || LPAD(nextval('booking_id_seq')::TEXT, 4, '0'),
  farmer_id             TEXT NOT NULL REFERENCES farmers(farmer_id) ON DELETE CASCADE,
  factory_id            TEXT NOT NULL REFERENCES factories(factory_id),
  est_tonnage           NUMERIC(10,2) NOT NULL,
  harvest_date          DATE NOT NULL,
  distance_band         TEXT NOT NULL,
  need_cutters          BOOLEAN NOT NULL DEFAULT FALSE,
  use_factory_transport BOOLEAN NOT NULL DEFAULT TRUE,
  status                TEXT NOT NULL DEFAULT 'Pending Confirmation',
  factory_truck_plate   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS harvest_bookings_farmer_idx
  ON harvest_bookings (farmer_id, created_at DESC);

-- Net weight is computed by the database so clerks cannot mistype it.
CREATE TABLE IF NOT EXISTS deliveries_weighbridge (
  ticket_no        TEXT PRIMARY KEY,
  booking_id       TEXT REFERENCES harvest_bookings(booking_id),
  farmer_id        TEXT NOT NULL REFERENCES farmers(farmer_id),
  factory_id       TEXT NOT NULL REFERENCES factories(factory_id),
  gross_tonnes     NUMERIC(10,3) NOT NULL,
  tare_tonnes      NUMERIC(10,3) NOT NULL,
  trash_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,
  payable_tonnage  NUMERIC(10,3) GENERATED ALWAYS AS (
                     ROUND((gross_tonnes - tare_tonnes) * (1 - trash_percent / 100), 3)
                   ) STORED,
  delivery_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS deliveries_farmer_idx
  ON deliveries_weighbridge (farmer_id, delivery_date DESC);

-- Gross and net cash payable are generated columns, so every statement on the
-- farmer's screen reconciles exactly with the deductions a clerk enters.
CREATE TABLE IF NOT EXISTS payouts_deductions (
  payout_id            BIGSERIAL PRIMARY KEY,
  ticket_no            TEXT NOT NULL UNIQUE
                       REFERENCES deliveries_weighbridge(ticket_no) ON DELETE CASCADE,
  farmer_id            TEXT NOT NULL REFERENCES farmers(farmer_id),
  payable_tonnage      NUMERIC(10,3) NOT NULL,
  price_per_tonne_kes  NUMERIC(12,2) NOT NULL,
  transport_kes        NUMERIC(12,2) NOT NULL DEFAULT 0,
  harvesting_kes       NUMERIC(12,2) NOT NULL DEFAULT 0,
  input_loan_kes       NUMERIC(12,2) NOT NULL DEFAULT 0,
  cess_levy_kes        NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_kes            NUMERIC(14,2) GENERATED ALWAYS AS (
                         ROUND(payable_tonnage * price_per_tonne_kes, 2)
                       ) STORED,
  net_payout_kes       NUMERIC(14,2) GENERATED ALWAYS AS (
                         ROUND(
                           payable_tonnage * price_per_tonne_kes
                           - transport_kes - harvesting_kes
                           - input_loan_kes - cess_levy_kes, 2
                         )
                       ) STORED,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed factories. ON CONFLICT DO NOTHING keeps live clerk-entered prices intact.
INSERT INTO factories
  (factory_id, factory_name, location, price_per_tonne_kes, avg_payment_days,
   payment_speed_rating, queue_status, transport_rate_0_15km,
   transport_rate_16_30km, transport_rate_31_plus_km)
VALUES
  ('FAC01', 'Mumias Sugar Company', 'Mumias, Kakamega', 6250, 21, 'Slow (21+ Days)', 'Medium', 800, 1100, 1450),
  ('FAC02', 'Nzoia Sugar Company', 'Bungoma', 6100, 14, 'Moderate (14 Days)', 'Low', 750, 1050, 1350),
  ('FAC03', 'Chemelil Sugar Company', 'Chemelil, Kisumu', 5980, 24, 'Slow (24+ Days)', 'High', 720, 1000, 1300),
  ('FAC04', 'Muhoroni Sugar Company', 'Muhoroni, Kisumu', 6050, 18, 'Moderate (18 Days)', 'Medium', 730, 1010, 1310),
  ('FAC05', 'Sony Sugar Company', 'Awendo, Migori', 5900, 30, 'Slow (30+ Days)', 'High', 850, 1250, 1600),
  ('FAC06', 'Kibos Sugar & Allied Industries', 'Kibos, Kisumu', 6400, 7, 'Fast (7 Days)', 'Low', 700, 950, 1250),
  ('FAC07', 'Butali Sugar Mills', 'Butali, Kakamega', 6320, 10, 'Fast (10 Days)', 'Low', 760, 1060, 1360),
  ('FAC08', 'Sukari Industries', 'Ndhiwa, Homa Bay', 6000, 16, 'Moderate (16 Days)', 'Medium', 820, 1180, 1500),
  ('FAC09', 'West Kenya Sugar Company', 'Kakamega', 6380, 9, 'Fast (9 Days)', 'Medium', 740, 1030, 1330),
  ('FAC10', 'Transmara Sugar Company', 'Kilgoris, Narok', 6150, 12, 'Moderate (12 Days)', 'Low', 900, 1350, 1750)
ON CONFLICT (factory_id) DO NOTHING;
