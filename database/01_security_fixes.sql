-- ============================================================
-- NavBus Security Fixes Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Create a Security Definer function to safely check admin status
--    This prevents the RLS infinite recursion error on the users table.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. Prevent Privilege Escalation
--    Trigger to stop non-admins from changing their own role or active status.
CREATE OR REPLACE FUNCTION public.check_restricted_user_updates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only admins can change roles or active status
  IF (SELECT role FROM public.users WHERE id = auth.uid()) != 'admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not authorized to change role';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Not authorized to change active status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_restrict_updates ON public.users;
CREATE TRIGGER trg_users_restrict_updates
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.check_restricted_user_updates();

-- 3. Replace all buggy RLS Policies with the safe `is_admin()` function
DROP POLICY IF EXISTS "admin_all_users" ON public.users;
CREATE POLICY "admin_all_users"
  ON public.users FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_all_drivers" ON public.drivers;
CREATE POLICY "admin_all_drivers"
  ON public.drivers FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_all_buses" ON public.buses;
CREATE POLICY "admin_all_buses"
  ON public.buses FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_all_travel_history" ON public.travel_history;
CREATE POLICY "admin_all_travel_history"
  ON public.travel_history FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_all_feedback" ON public.feedback;
CREATE POLICY "admin_all_feedback"
  ON public.feedback FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

SELECT 'Security fixes applied successfully.' AS result;
