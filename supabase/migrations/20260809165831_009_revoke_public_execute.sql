-- Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions
-- then grant only to service_role (used by edge functions)

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_activity(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_overdue_invoices() FROM PUBLIC;

-- Re-grant to service_role only (edge functions use service role key)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_activity(uuid, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_overdue_invoices() TO service_role;