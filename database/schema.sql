-- ============================================================
-- NavBus — PostgreSQL Database Schema
-- GPS Tracking + Camera Integration
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS
-- Stores all registered users (passengers + admins)
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT UNIQUE,
  role            TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user', 'admin')),
  avatar_url      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users          IS 'All NavBus registered users — passengers and admins';
COMMENT ON COLUMN users.role     IS 'user = passenger, admin = fleet manager';
COMMENT ON COLUMN users.id       IS 'Linked to Supabase auth.users.id';

-- ============================================================
-- 2. ROUTES
-- Named bus routes (e.g. Route 12 — Central to Airport)
-- ============================================================
CREATE TABLE routes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_number    TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  total_distance_km  NUMERIC(7, 2),
  estimated_duration_min INT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  routes               IS 'Bus route definitions';
COMMENT ON COLUMN routes.route_number  IS 'Short public-facing code, e.g. "12A"';
COMMENT ON COLUMN routes.origin        IS 'Starting stop name / area';
COMMENT ON COLUMN routes.destination   IS 'Ending stop name / area';

-- ============================================================
-- 3. STOPS
-- Individual bus stops linked to routes
-- ============================================================
CREATE TABLE stops (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id        UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT UNIQUE,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  sequence_order  INT NOT NULL,
  landmark        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (route_id, sequence_order)
);

COMMENT ON TABLE  stops                IS 'Individual stops along a route';
COMMENT ON COLUMN stops.sequence_order IS 'Order of this stop within its route (1 = first)';
COMMENT ON COLUMN stops.code           IS 'Short public stop code, e.g. "ST-042"';
COMMENT ON COLUMN stops.landmark       IS 'Nearby landmark for passenger reference';

-- ============================================================
-- 4. DRIVERS
-- Driver profiles assigned to buses
-- ============================================================
CREATE TABLE drivers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL UNIQUE,
  email           TEXT UNIQUE,
  license_number  TEXT NOT NULL UNIQUE,
  license_expiry  DATE NOT NULL,
  photo_url       TEXT,
  biometric_url   TEXT,
  address         TEXT,
  date_of_birth   DATE,
  joining_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  drivers                IS 'Bus driver profiles';
COMMENT ON COLUMN drivers.license_number IS 'Government-issued driving license number';
COMMENT ON COLUMN drivers.license_expiry IS 'License renewal due date — used for alerts';

-- ============================================================
-- 5. BUSES
-- Physical bus units with device + camera integration
-- ============================================================
CREATE TABLE buses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity
  number_plate    TEXT NOT NULL UNIQUE,
  bus_name        TEXT,
  bus_model       TEXT,
  manufacturer    TEXT,
  year_of_make    INT CHECK (year_of_make BETWEEN 1990 AND 2100),
  color           TEXT,
  capacity        INT NOT NULL DEFAULT 40
                  CHECK (capacity > 0 AND capacity <= 120),

  -- IoT Hardware
  device_id       TEXT NOT NULL UNIQUE,

  -- Camera Integration (WiFi IP cameras)
  camera_url_front  TEXT,
  camera_url_rear   TEXT,
  camera_url_cabin  TEXT,
  camera_url_driver TEXT,

  -- Assignments
  route_id        UUID REFERENCES routes(id)  ON DELETE SET NULL,
  driver_id       UUID REFERENCES drivers(id) ON DELETE SET NULL,

  -- Status
  status          TEXT NOT NULL DEFAULT 'offline'
                  CHECK (status IN ('online', 'offline', 'maintenance', 'alert')),
  is_active       BOOLEAN NOT NULL DEFAULT true,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  buses                   IS 'Physical bus fleet with hardware device mapping';
COMMENT ON COLUMN buses.device_id         IS 'Unique hardware ID flashed into ESP32/IoT device — links all telemetry';
COMMENT ON COLUMN buses.camera_url_front  IS 'RTSP or HLS stream URL for front-facing camera';
COMMENT ON COLUMN buses.camera_url_rear   IS 'RTSP or HLS stream URL for rear camera';
COMMENT ON COLUMN buses.camera_url_cabin  IS 'RTSP or HLS stream URL for cabin-facing camera';
COMMENT ON COLUMN buses.camera_url_driver IS 'RTSP or HLS stream URL for driver-facing camera';
COMMENT ON COLUMN buses.route_id          IS 'Currently assigned route (nullable — bus may be unassigned)';
COMMENT ON COLUMN buses.driver_id         IS 'Currently assigned driver (nullable)';

-- ============================================================
-- 6. BUS_STATUS (GPS Telemetry)
-- Real-time GPS positions pushed by IoT device
-- ============================================================
CREATE TABLE bus_status (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Device link (same device_id as buses.device_id)
  device_id       TEXT NOT NULL REFERENCES buses(device_id) ON DELETE CASCADE,

  -- GPS Data
  latitude        DOUBLE PRECISION NOT NULL
                  CHECK (latitude  BETWEEN -90  AND  90),
  longitude       DOUBLE PRECISION NOT NULL
                  CHECK (longitude BETWEEN -180 AND 180),
  altitude_m      REAL,
  speed_kmh       REAL NOT NULL DEFAULT 0
                  CHECK (speed_kmh >= 0),
  heading_deg     REAL DEFAULT 0
                  CHECK (heading_deg BETWEEN 0 AND 360),
  accuracy_m      REAL,
  satellites      INT  DEFAULT 0
                  CHECK (satellites >= 0),

  -- Derived / Event flags
  is_moving       BOOLEAN NOT NULL DEFAULT false,
  near_stop_id    UUID REFERENCES stops(id) ON DELETE SET NULL,

  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  bus_status            IS 'GPS telemetry stream from IoT hardware — one row per GPS ping';
COMMENT ON COLUMN bus_status.device_id  IS 'Foreign key to buses.device_id — auto-links to bus without manual join';
COMMENT ON COLUMN bus_status.heading_deg IS '0 = North, 90 = East, 180 = South, 270 = West';
COMMENT ON COLUMN bus_status.near_stop_id IS 'Auto-populated if bus is within ~50m of a stop';
COMMENT ON COLUMN bus_status.is_moving   IS 'True if speed_kmh > 2';
COMMENT ON COLUMN bus_status.accuracy_m  IS 'GPS horizontal accuracy in meters (lower = better)';

-- ============================================================
-- 7. TRAVEL_HISTORY
-- Completed trip records — one row per bus trip
-- ============================================================
CREATE TABLE travel_history (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  bus_id              UUID NOT NULL REFERENCES buses(id)   ON DELETE CASCADE,
  driver_id           UUID          REFERENCES drivers(id) ON DELETE SET NULL,
  route_id            UUID          REFERENCES routes(id)  ON DELETE SET NULL,

  -- Trip data
  start_stop_id       UUID REFERENCES stops(id) ON DELETE SET NULL,
  end_stop_id         UUID REFERENCES stops(id) ON DELETE SET NULL,
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ,
  duration_min        INT GENERATED ALWAYS AS (
                        CASE
                          WHEN end_time IS NOT NULL
                          THEN EXTRACT(EPOCH FROM (end_time - start_time))::INT / 60
                          ELSE NULL
                        END
                      ) STORED,

  -- GPS summary
  start_latitude      DOUBLE PRECISION,
  start_longitude     DOUBLE PRECISION,
  end_latitude        DOUBLE PRECISION,
  end_longitude       DOUBLE PRECISION,
  distance_covered_km NUMERIC(8, 3),
  max_speed_kmh       REAL,
  avg_speed_kmh       REAL,

  -- Passenger info
  passenger_count     INT DEFAULT 0 CHECK (passenger_count >= 0),

  -- Trip state
  status              TEXT NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress', 'completed', 'cancelled', 'incomplete')),
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  travel_history             IS 'Completed and in-progress bus trip records';
COMMENT ON COLUMN travel_history.duration_min IS 'Auto-computed from start_time and end_time in minutes';
COMMENT ON COLUMN travel_history.status       IS 'in_progress = active trip, completed = normal end, cancelled/incomplete = abnormal';

-- ============================================================
-- 8. FEEDBACK
-- Passenger feedback submitted for a specific bus trip
-- ============================================================
CREATE TABLE feedback (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who submitted
  user_id         UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,

  -- What it's about
  bus_id          UUID NOT NULL REFERENCES buses(id)   ON DELETE CASCADE,
  driver_id       UUID          REFERENCES drivers(id) ON DELETE SET NULL,
  route_id        UUID          REFERENCES routes(id)  ON DELETE SET NULL,
  trip_id         UUID          REFERENCES travel_history(id) ON DELETE SET NULL,

  -- Ratings (1–5 stars)
  rating_overall  INT NOT NULL CHECK (rating_overall  BETWEEN 1 AND 5),
  rating_driver   INT          CHECK (rating_driver   BETWEEN 1 AND 5),
  rating_punctuality INT       CHECK (rating_punctuality BETWEEN 1 AND 5),
  rating_comfort  INT          CHECK (rating_comfort  BETWEEN 1 AND 5),

  -- Feedback content
  category        TEXT DEFAULT 'general'
                  CHECK (category IN ('general', 'complaint', 'suggestion', 'compliment', 'safety')),
  comment         TEXT,
  is_anonymous    BOOLEAN NOT NULL DEFAULT false,

  -- Admin response
  admin_response  TEXT,
  responded_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  responded_at    TIMESTAMPTZ,

  -- State
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'reviewed', 'resolved', 'closed')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  feedback                   IS 'Passenger feedback and ratings per trip or bus';
COMMENT ON COLUMN feedback.is_anonymous      IS 'If true, hide user identity in admin view';
COMMENT ON COLUMN feedback.rating_overall    IS '1 = very poor, 5 = excellent';
COMMENT ON COLUMN feedback.responded_by      IS 'Admin user who replied to this feedback';

-- ============================================================
-- INDEXES — Performance for common queries
-- ============================================================

-- bus_status: most common query is latest position per device
CREATE INDEX idx_bus_status_device_id    ON bus_status(device_id);
CREATE INDEX idx_bus_status_recorded_at  ON bus_status(recorded_at DESC);
CREATE INDEX idx_bus_status_device_time  ON bus_status(device_id, recorded_at DESC);

-- buses: lookup by device_id from hardware
CREATE INDEX idx_buses_device_id         ON buses(device_id);
CREATE INDEX idx_buses_route_id          ON buses(route_id);
CREATE INDEX idx_buses_driver_id         ON buses(driver_id);
CREATE INDEX idx_buses_status            ON buses(status);

-- stops: ordered by route
CREATE INDEX idx_stops_route_id          ON stops(route_id);
CREATE INDEX idx_stops_sequence          ON stops(route_id, sequence_order);

-- travel_history: reporting queries
CREATE INDEX idx_travel_bus_id           ON travel_history(bus_id);
CREATE INDEX idx_travel_driver_id        ON travel_history(driver_id);
CREATE INDEX idx_travel_route_id         ON travel_history(route_id);
CREATE INDEX idx_travel_start_time       ON travel_history(start_time DESC);
CREATE INDEX idx_travel_status           ON travel_history(status);

-- feedback: admin dashboard
CREATE INDEX idx_feedback_bus_id         ON feedback(bus_id);
CREATE INDEX idx_feedback_user_id        ON feedback(user_id);
CREATE INDEX idx_feedback_driver_id      ON feedback(driver_id);
CREATE INDEX idx_feedback_status         ON feedback(status);
CREATE INDEX idx_feedback_created_at     ON feedback(created_at DESC);

-- users: role-based filtering
CREATE INDEX idx_users_role              ON users(role);
CREATE INDEX idx_users_email             ON users(email);

-- ============================================================
-- VIEWS — Pre-joined data for dashboard queries
-- ============================================================

-- Latest GPS position per bus (used by live map)
CREATE VIEW bus_live_positions AS
SELECT DISTINCT ON (b.device_id)
  b.id              AS bus_id,
  b.device_id,
  b.number_plate,
  b.bus_name,
  b.status          AS bus_status,
  b.capacity,
  b.camera_url_front,
  b.camera_url_rear,
  b.camera_url_cabin,
  b.camera_url_driver,
  r.id              AS route_id,
  r.route_number,
  r.name            AS route_name,
  d.id              AS driver_id,
  d.name            AS driver_name,
  d.phone           AS driver_phone,
  gs.latitude,
  gs.longitude,
  gs.altitude_m,
  gs.speed_kmh,
  gs.heading_deg,
  gs.is_moving,
  gs.satellites,
  gs.near_stop_id,
  gs.recorded_at    AS last_seen_at
FROM buses b
LEFT JOIN routes   r  ON r.id = b.route_id
LEFT JOIN drivers  d  ON d.id = b.driver_id
LEFT JOIN bus_status gs ON gs.device_id = b.device_id
ORDER BY b.device_id, gs.recorded_at DESC;

COMMENT ON VIEW bus_live_positions IS 'Latest GPS fix per bus — joined with route, driver, and camera URLs';

-- ──────────────────────────────────────────────────────────────

-- Fleet summary for admin dashboard
CREATE VIEW fleet_summary AS
SELECT
  COUNT(*)                                          AS total_buses,
  COUNT(*) FILTER (WHERE status = 'online')         AS online,
  COUNT(*) FILTER (WHERE status = 'offline')        AS offline,
  COUNT(*) FILTER (WHERE status = 'maintenance')    AS maintenance,
  COUNT(*) FILTER (WHERE status = 'alert')          AS alert,
  COUNT(*) FILTER (WHERE is_active = true)          AS active,
  COUNT(*) FILTER (WHERE driver_id IS NOT NULL)     AS assigned_buses,
  COUNT(*) FILTER (WHERE driver_id IS NULL
                   AND   is_active = true)          AS unassigned_buses
FROM buses;

COMMENT ON VIEW fleet_summary IS 'Single-row fleet health overview for admin dashboard stats';

-- ──────────────────────────────────────────────────────────────

-- Route summary with stop count and active buses
CREATE VIEW route_summary AS
SELECT
  r.id,
  r.route_number,
  r.name,
  r.origin,
  r.destination,
  r.total_distance_km,
  r.estimated_duration_min,
  r.is_active,
  COUNT(DISTINCT s.id)  AS total_stops,
  COUNT(DISTINCT b.id)  AS total_buses,
  COUNT(DISTINCT b.id)
    FILTER (WHERE b.status = 'online') AS buses_online
FROM routes r
LEFT JOIN stops   s ON s.route_id = r.id
LEFT JOIN buses   b ON b.route_id = r.id AND b.is_active = true
GROUP BY r.id, r.route_number, r.name, r.origin,
         r.destination, r.total_distance_km,
         r.estimated_duration_min, r.is_active;

COMMENT ON VIEW route_summary IS 'Route list enriched with stop count and active bus count';

-- ──────────────────────────────────────────────────────────────

-- Driver performance view
CREATE VIEW driver_performance AS
SELECT
  d.id            AS driver_id,
  d.name          AS driver_name,
  d.phone,
  d.license_expiry,
  d.is_active,
  COUNT(th.id)                        AS total_trips,
  COUNT(th.id) FILTER (WHERE th.status = 'completed')  AS completed_trips,
  COUNT(th.id) FILTER (WHERE th.status = 'cancelled')  AS cancelled_trips,
  ROUND(AVG(th.avg_speed_kmh)::NUMERIC, 1)             AS avg_speed_kmh,
  ROUND(SUM(th.distance_covered_km)::NUMERIC, 2)       AS total_km_driven,
  ROUND(AVG(f.rating_driver)::NUMERIC, 2)              AS avg_rating,
  COUNT(f.id)                         AS total_feedback
FROM drivers d
LEFT JOIN travel_history th ON th.driver_id = d.id
LEFT JOIN feedback        f  ON f.driver_id  = d.id
GROUP BY d.id, d.name, d.phone, d.license_expiry, d.is_active;

COMMENT ON VIEW driver_performance IS 'Per-driver trip stats and passenger rating aggregates';

-- ============================================================
-- TRIGGERS — Auto-maintenance
-- ============================================================

-- Auto-update updated_at on all core tables
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_buses_updated_at
  BEFORE UPDATE ON buses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_stops_updated_at
  BEFORE UPDATE ON stops
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- Auto-set buses.status = 'online' when GPS ping arrives
-- Auto-set is_moving flag based on speed
CREATE OR REPLACE FUNCTION trigger_gps_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Mark bus online when device sends a ping
  UPDATE buses
  SET    status     = 'online',
         updated_at = NOW()
  WHERE  device_id  = NEW.device_id
  AND    status     = 'offline';

  -- Set is_moving based on speed threshold (> 2 km/h)
  NEW.is_moving := (NEW.speed_kmh > 2);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bus_status_on_gps
  BEFORE INSERT ON bus_status
  FOR EACH ROW EXECUTE FUNCTION trigger_gps_insert();

-- ──────────────────────────────────────────────────────────────
-- Auto-close trip when bus goes offline / new trip starts
CREATE OR REPLACE FUNCTION trigger_complete_open_trips()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When a bus goes offline, mark any open trip as incomplete
  IF NEW.status = 'offline' AND OLD.status = 'online' THEN
    UPDATE travel_history
    SET    status   = 'incomplete',
           end_time = NOW()
    WHERE  bus_id   = NEW.id
    AND    status   = 'in_progress';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trips_on_bus_offline
  AFTER UPDATE OF status ON buses
  FOR EACH ROW
  WHEN (NEW.status = 'offline' AND OLD.status <> 'offline')
  EXECUTE FUNCTION trigger_complete_open_trips();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE buses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops           ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_status      ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback        ENABLE ROW LEVEL SECURITY;

-- ── Service role: unrestricted (used by hardware + backend) ──
CREATE POLICY "service_role_all_users"          ON users          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_buses"          ON buses          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_routes"         ON routes         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_stops"          ON stops          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_drivers"        ON drivers        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_bus_status"     ON bus_status     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_travel_history" ON travel_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_feedback"       ON feedback       FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Anon / authenticated: public read for map data ───────────
CREATE POLICY "public_read_routes"     ON routes     FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "public_read_stops"      ON stops      FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "public_read_bus_status" ON bus_status FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_buses"      ON buses      FOR SELECT TO anon, authenticated USING (is_active = true);

-- ── Authenticated users: own data only ───────────────────────
CREATE POLICY "users_read_own"
  ON users FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users_update_own"
  ON users FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "feedback_insert_own"
  ON feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedback_read_own"
  ON feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_anonymous = false);

CREATE POLICY "travel_history_read_own"
  ON travel_history FOR SELECT TO authenticated
  USING (true);

-- ── Admin role: full read/write via role check ────────────────
CREATE POLICY "admin_all_users"
  ON users FOR ALL TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "admin_all_drivers"
  ON drivers FOR ALL TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "admin_all_buses"
  ON buses FOR ALL TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "admin_all_travel_history"
  ON travel_history FOR ALL TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "admin_all_feedback"
  ON feedback FOR ALL TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );
