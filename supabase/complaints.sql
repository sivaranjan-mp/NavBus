-- ============================================================
-- NavBus — Complaints Table
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS complaints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category      TEXT NOT NULL
                CHECK (category IN (
                  'driver_behaviour','vehicle_condition',
                  'delay_punctuality','overcrowding',
                  'safety_concern','other'
                )),
  severity      TEXT NOT NULL DEFAULT 'medium'
                CHECK (severity IN ('low','medium','high')),
  bus_plate     TEXT,
  route_id      UUID REFERENCES routes(id) ON DELETE SET NULL,
  incident_at   TIMESTAMPTZ,
  description   TEXT NOT NULL,
  is_anonymous  BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','reviewing','resolved','closed')),
  admin_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_complaints_user_id   ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status    ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created   ON complaints(created_at DESC);

-- ── Auto-update updated_at ────────────────────────────────────
CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- Users can insert complaints (even anonymous ones)
CREATE POLICY "complaints_insert"
  ON complaints FOR INSERT
  WITH CHECK (true);

-- Users can read their own non-anonymous complaints
CREATE POLICY "complaints_own_read"
  ON complaints FOR SELECT
  USING (
    is_anonymous = false AND auth.uid() = user_id
  );

-- Admins can read all complaints
CREATE POLICY "complaints_admin_read"
  ON complaints FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Admins can update status and admin_note
CREATE POLICY "complaints_admin_update"
  ON complaints FOR UPDATE
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- ── Add image_url column (run if table already exists) ────────
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── Supabase Storage bucket for complaint images ─────────────
-- Run in Supabase Dashboard → Storage → New Bucket:
--   Name: complaint-images
--   Public: true (so images can be viewed by admin)
