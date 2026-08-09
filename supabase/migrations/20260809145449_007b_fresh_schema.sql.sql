/*
# LegalGuard — Fresh clean production schema

No demo data, no seed functions. Production-ready with proper RLS on
every table, authenticated-only access, and user_id ownership.
*/

-- ============ profiles ============
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, company)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon, authenticated;

-- ============ contracts ============
CREATE TABLE contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  title text NOT NULL,
  client text NOT NULL,
  page_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','scanned','draft','failed')),
  risk_score int NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  raw_text text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts_select" ON contracts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "contracts_insert" ON contracts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contracts_update" ON contracts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contracts_delete" ON contracts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_contracts_user ON contracts(user_id);
CREATE INDEX idx_contracts_uploaded ON contracts(uploaded_at DESC);

-- ============ clause_flags ============
CREATE TABLE clause_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'medium' CHECK (level IN ('high','medium','low')),
  title text NOT NULL,
  excerpt text,
  plain_english text,
  pushback text,
  clause_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clause_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clause_flags_select" ON clause_flags FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "clause_flags_insert" ON clause_flags FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clause_flags_update" ON clause_flags FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clause_flags_delete" ON clause_flags FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_clause_flags_contract ON clause_flags(contract_id);
CREATE INDEX idx_clause_flags_user ON clause_flags(user_id);

-- ============ contract_terms ============
CREATE TABLE contract_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL,
  category text NOT NULL DEFAULT 'payment' CHECK (category IN ('payment','scope','deadline','ip','termination','liability')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contract_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_terms_select" ON contract_terms FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "contract_terms_insert" ON contract_terms FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contract_terms_update" ON contract_terms FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contract_terms_delete" ON contract_terms FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_contract_terms_contract ON contract_terms(contract_id);
CREATE INDEX idx_contract_terms_user ON contract_terms(user_id);

-- ============ invoices ============
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  number text NOT NULL UNIQUE,
  client text NOT NULL,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  issued_at date NOT NULL,
  due_at date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('paid','overdue','sent','draft')),
  days_late int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select" ON invoices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "invoices_insert" ON invoices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "invoices_update" ON invoices FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "invoices_delete" ON invoices FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_invoices_contract ON invoices(contract_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_user ON invoices(user_id);
CREATE INDEX idx_invoices_client ON invoices(client);

-- ============ email_drafts ============
CREATE TABLE email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  tone text NOT NULL DEFAULT 'professional' CHECK (tone IN ('friendly','professional','firm','final')),
  subject text,
  body text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','regenerated')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_drafts_select" ON email_drafts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "email_drafts_insert" ON email_drafts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "email_drafts_update" ON email_drafts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "email_drafts_delete" ON email_drafts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_email_drafts_invoice ON email_drafts(invoice_id);
CREATE INDEX idx_email_drafts_user ON email_drafts(user_id);

-- ============ webhook_events ============
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  source text NOT NULL DEFAULT 'stripe',
  event_type text NOT NULL,
  payload jsonb,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  processed boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_select" ON webhook_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "webhook_events_insert" ON webhook_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "webhook_events_update" ON webhook_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "webhook_events_delete" ON webhook_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_webhook_events_invoice ON webhook_events(invoice_id);
CREATE INDEX idx_webhook_events_user ON webhook_events(user_id);

-- ============ activity_log ============
CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  event_type text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','success')),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log_select" ON activity_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "activity_log_update" ON activity_log FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "activity_log_delete" ON activity_log FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX idx_activity_log_user ON activity_log(user_id);

-- ============ clients ============
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  relationship_health text NOT NULL DEFAULT 'good' CHECK (relationship_health IN ('good','strained','at_risk')),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high')),
  total_outstanding numeric NOT NULL DEFAULT 0,
  total_overdue numeric NOT NULL DEFAULT 0,
  avg_payment_delay_days int NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON clients FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "clients_insert" ON clients FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clients_update" ON clients FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clients_delete" ON clients FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_clients_user ON clients(user_id);
CREATE INDEX idx_clients_name ON clients(name);

-- ============ client_communications ============
CREATE TABLE client_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  client_name text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  sentiment text NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('positive','neutral','negative')),
  has_payment_discussion boolean NOT NULL DEFAULT false,
  has_dispute boolean NOT NULL DEFAULT false,
  has_promise boolean NOT NULL DEFAULT false,
  promise_date date,
  promise_amount numeric,
  processed boolean NOT NULL DEFAULT true,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_communications_select" ON client_communications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "client_communications_insert" ON client_communications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "client_communications_update" ON client_communications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "client_communications_delete" ON client_communications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_communications_user ON client_communications(user_id);
CREATE INDEX idx_communications_client ON client_communications(client_name);

-- ============ payment_promises ============
CREATE TABLE payment_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  client_name text NOT NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_number text NOT NULL DEFAULT '',
  promised_amount numeric NOT NULL DEFAULT 0,
  promised_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed')),
  source_communication_id uuid REFERENCES client_communications(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_promises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_promises_select" ON payment_promises FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "payment_promises_insert" ON payment_promises FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payment_promises_update" ON payment_promises FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payment_promises_delete" ON payment_promises FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_promises_user ON payment_promises(user_id);
CREATE INDEX idx_promises_status ON payment_promises(status);
CREATE INDEX idx_promises_client ON payment_promises(client_name);

-- ============ ai_insights ============
CREATE TABLE ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  client_name text NOT NULL,
  insight_type text NOT NULL DEFAULT 'risk_assessment',
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high')),
  summary text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_action text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT 'none' CHECK (action_type IN ('reminder','clarification','relationship','firm','escalation','none')),
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_insights_select" ON ai_insights FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ai_insights_insert" ON ai_insights FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_insights_update" ON ai_insights FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_insights_delete" ON ai_insights FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_ai_insights_user ON ai_insights(user_id);
CREATE INDEX idx_ai_insights_client ON ai_insights(client_name);

-- ============ workspace_settings ============
CREATE TABLE workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nim_api_key text NOT NULL DEFAULT '',
  nim_model text NOT NULL DEFAULT 'nvidia/nemotron-3-nano-30b-a3b',
  nim_base_url text NOT NULL DEFAULT 'https://integrate.api.nvidia.com/v1',
  stripe_webhook_secret text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_settings_select" ON workspace_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "workspace_settings_insert" ON workspace_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "workspace_settings_update" ON workspace_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "workspace_settings_delete" ON workspace_settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_workspace_settings_user ON workspace_settings(user_id);

-- ============ Helper functions ============

CREATE OR REPLACE FUNCTION log_activity(
  p_user_id uuid,
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
  INSERT INTO activity_log (user_id, event_type, description, severity, meta)
  VALUES (p_user_id, p_event_type, p_description, p_severity, p_meta);
END;
$$;

REVOKE EXECUTE ON FUNCTION log_activity(uuid, text, text, text, jsonb) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION refresh_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE invoices
  SET status = 'overdue',
      days_late = GREATEST(0, (CURRENT_DATE - due_at)::int)
  WHERE status IN ('sent','overdue')
    AND due_at < CURRENT_DATE
    AND (CURRENT_DATE - due_at)::int > 0
    AND user_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION refresh_overdue_invoices() FROM anon, authenticated;

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE contracts;
ALTER PUBLICATION supabase_realtime ADD TABLE clause_flags;
ALTER PUBLICATION supabase_realtime ADD TABLE contract_terms;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE email_drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE webhook_events;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE client_communications;
ALTER PUBLICATION supabase_realtime ADD TABLE payment_promises;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_insights;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_settings;
