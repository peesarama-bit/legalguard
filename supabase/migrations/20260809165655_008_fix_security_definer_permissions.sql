-- Revoke EXECUTE from anon and authenticated on SECURITY DEFINER functions
-- that should only be called internally (by triggers or edge functions using service role)

-- handle_new_user: only called by auth trigger, not by clients
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- log_activity: only called by edge functions using service role key
REVOKE EXECUTE ON FUNCTION public.log_activity(uuid, text, text, text, jsonb) FROM anon, authenticated;

-- refresh_overdue_invoices: only called by edge functions or cron, not by clients
REVOKE EXECUTE ON FUNCTION public.refresh_overdue_invoices() FROM anon, authenticated;