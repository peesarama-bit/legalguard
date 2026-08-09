/*
# Freesheet — core schema

## Overview
Creates the full data model for the Freesheet freelancer co-pilot:
contracts, clause flags, extracted terms, invoices, AI email drafts,
webhook events, and a realtime activity log. Single-tenant app (no auth)
so all policies are open to anon + authenticated.

## New Tables
1. `contracts` — uploaded contracts/MSAs with risk score and status
2. `clause_flags` — red-flag clauses found during scanning (high/medium/low)
3. `contract_terms` — extracted financial/scope terms per contract
4. `invoices` — invoices linked to contracts, with overdue tracking
5. `email_drafts` — AI-generated follow-up emails, tone-tagged
6. `webhook_events` — inbound webhook events (Stripe overdue, etc.)
7. `activity_log` — realtime activity feed for monitoring

## Security
- RLS enabled on all tables.
- All policies TO anon, authenticated (single-tenant, intentionally shared).
- 4 CRUD policies per table (select/insert/update/delete).
*/

-- ============ contracts ============
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

DROP POLICY IF EXISTS "contracts_select" ON contracts;
CREATE POLICY "contracts_select" ON contracts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "contracts_insert" ON contracts;
CREATE POLICY "contracts_insert" ON contracts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "contracts_update" ON contracts;
CREATE POLICY "contracts_update" ON contracts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "contracts_delete" ON contracts;
CREATE POLICY "contracts_delete" ON contracts FOR DELETE TO anon, authenticated USING (true);

-- ============ clause_flags ============
CREATE TABLE IF NOT EXISTS clause_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

DROP POLICY IF EXISTS "clause_flags_select" ON clause_flags;
CREATE POLICY "clause_flags_select" ON clause_flags FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "clause_flags_insert" ON clause_flags;
CREATE POLICY "clause_flags_insert" ON clause_flags FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "clause_flags_update" ON clause_flags;
CREATE POLICY "clause_flags_update" ON clause_flags FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "clause_flags_delete" ON clause_flags;
CREATE POLICY "clause_flags_delete" ON clause_flags FOR DELETE TO anon, authenticated USING (true);

-- ============ contract_terms ============
CREATE TABLE IF NOT EXISTS contract_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL,
  category text NOT NULL DEFAULT 'payment' CHECK (category IN ('payment','scope','deadline','ip','termination','liability')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contract_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_terms_select" ON contract_terms;
CREATE POLICY "contract_terms_select" ON contract_terms FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "contract_terms_insert" ON contract_terms;
CREATE POLICY "contract_terms_insert" ON contract_terms FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "contract_terms_update" ON contract_terms;
CREATE POLICY "contract_terms_update" ON contract_terms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "contract_terms_delete" ON contract_terms;
CREATE POLICY "contract_terms_delete" ON contract_terms FOR DELETE TO anon, authenticated USING (true);

-- ============ invoices ============
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

DROP POLICY IF EXISTS "invoices_select" ON invoices;
CREATE POLICY "invoices_select" ON invoices FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
CREATE POLICY "invoices_insert" ON invoices FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "invoices_update" ON invoices;
CREATE POLICY "invoices_update" ON invoices FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "invoices_delete" ON invoices;
CREATE POLICY "invoices_delete" ON invoices FOR DELETE TO anon, authenticated USING (true);

-- ============ email_drafts ============
CREATE TABLE IF NOT EXISTS email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  tone text NOT NULL DEFAULT 'professional' CHECK (tone IN ('friendly','professional','firm','final')),
  subject text,
  body text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','regenerated')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_drafts_select" ON email_drafts;
CREATE POLICY "email_drafts_select" ON email_drafts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "email_drafts_insert" ON email_drafts;
CREATE POLICY "email_drafts_insert" ON email_drafts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "email_drafts_update" ON email_drafts;
CREATE POLICY "email_drafts_update" ON email_drafts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "email_drafts_delete" ON email_drafts;
CREATE POLICY "email_drafts_delete" ON email_drafts FOR DELETE TO anon, authenticated USING (true);

-- ============ webhook_events ============
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'stripe',
  event_type text NOT NULL,
  payload jsonb,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  processed boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_events_select" ON webhook_events;
CREATE POLICY "webhook_events_select" ON webhook_events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "webhook_events_insert" ON webhook_events;
CREATE POLICY "webhook_events_insert" ON webhook_events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "webhook_events_update" ON webhook_events;
CREATE POLICY "webhook_events_update" ON webhook_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "webhook_events_delete" ON webhook_events;
CREATE POLICY "webhook_events_delete" ON webhook_events FOR DELETE TO anon, authenticated USING (true);

-- ============ activity_log ============
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','success')),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_log_select" ON activity_log;
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "activity_log_insert" ON activity_log;
CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "activity_log_update" ON activity_log;
CREATE POLICY "activity_log_update" ON activity_log FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "activity_log_delete" ON activity_log;
CREATE POLICY "activity_log_delete" ON activity_log FOR DELETE TO anon, authenticated USING (true);

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_clause_flags_contract ON clause_flags(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_terms_contract ON contract_terms(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_email_drafts_invoice ON email_drafts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_invoice ON webhook_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

-- ============ Realtime ============
-- Enable realtime on all tables so the frontend can subscribe to changes
ALTER PUBLICATION supabase_realtime ADD TABLE contracts;
ALTER PUBLICATION supabase_realtime ADD TABLE clause_flags;
ALTER PUBLICATION supabase_realtime ADD TABLE contract_terms;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE email_drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE webhook_events;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;

-- ============ Auto-overdue trigger ============
-- Automatically recomputes days_late and status for overdue invoices
CREATE OR REPLACE FUNCTION refresh_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE invoices
  SET status = 'overdue',
      days_late = GREATEST(0, (CURRENT_DATE - due_at)::int)
  WHERE status IN ('sent','overdue')
    AND due_at < CURRENT_DATE
    AND (CURRENT_DATE - due_at)::int > 0;
END;
$$;

-- Helper to log activity from anywhere
CREATE OR REPLACE FUNCTION log_activity(p_event_type text, p_description text, p_severity text DEFAULT 'info', p_meta jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO activity_log (event_type, description, severity, meta)
  VALUES (p_event_type, p_description, p_severity, p_meta);
END;
$$;
