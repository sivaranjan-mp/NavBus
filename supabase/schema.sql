-- ============================================================
-- NavBus — Auth Schema
-- Run this in Supabase SQL Editor before using the auth module
-- ============================================================

-- ── Profiles table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL DEFAULT 'user'
               CHECK (role IN ('user', 'admin')),
  avatar_url   TEXT,
  phone        TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- User can read/update their own profile
CREATE POLICY "Own profile read"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Own profile update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin can read all profiles
-- FIX: Use auth.jwt() to avoid recursive RLS self-reference on the profiles table.
-- The old USING clause did (SELECT role FROM profiles WHERE id = auth.uid()) which
-- caused infinite recursion: reading profiles triggers this policy, which reads
-- profiles, which triggers the policy again, crashing Postgres.
CREATE POLICY "Admin reads all profiles"
  ON profiles FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Service role (used by hardware/backend) has full access
CREATE POLICY "Service role full access"
  ON profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow upsert during signup (anon role)
CREATE POLICY "Allow profile insert on signup"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── Auto-create profile on user signup ──────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name',  'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger: fires after every new user in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Auto-update updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
