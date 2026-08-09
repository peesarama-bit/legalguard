/*
# Fix security warnings

## Security Changes
1. Revoke EXECUTE on SECURITY DEFINER functions from anon and authenticated.
   These are internal functions — only triggers or edge functions (service role)
   should call them, not the REST API.
2. Fix mutable search_path on log_activity and refresh_overdue_invoices.
*/

-- Revoke EXECUTE on trigger/helper functions from anon + authenticated
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION seed_demo_data_for_user(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION refresh_overdue_invoices() FROM anon, authenticated;

-- Recreate log_activity with explicit search_path
-- (drop old version with old signature first)
DROP FUNCTION IF EXISTS log_activity(text, text, text, jsonb);

CREATE OR REPLACE FUNCTION log_activity(
  p_event_type text,
  p_description text,
  p_severity text DEFAULT 'info',
  p_meta jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO activity_log (event_type, description, severity, meta)
  VALUES (p_event_type, p_description, p_severity, p_meta);
END;
$$;

REVOKE EXECUTE ON FUNCTION log_activity(text, text, text, jsonb) FROM anon, authenticated;

-- Recreate refresh_overdue_invoices with explicit search_path
DROP FUNCTION IF EXISTS refresh_overdue_invoices();

CREATE OR REPLACE FUNCTION refresh_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE invoices
  SET status = 'overdue',
      days_late = GREATEST(0, EXTRACT(DAY FROM now() - due_at)::int)
  WHERE status = 'sent'
    AND due_at < now()
    AND user_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION refresh_overdue_invoices() FROM anon, authenticated;
