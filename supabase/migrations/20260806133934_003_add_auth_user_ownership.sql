/*
# Add authentication: per-user ownership on all tables

## Overview
Converts the app from single-tenant to multi-user (authenticated only).
Every table gets a `user_id` column defaulting to `auth.uid()`. All RLS
policies replaced with ownership checks. A `profiles` table is added for
account management. A trigger auto-creates a profile on signup.

## New Tables
- `profiles` — user account metadata (display name, company, avatar url)

## Modified Tables (all get user_id column)
1. contracts 2. clause_flags 3. contract_terms 4. invoices
5. email_drafts 6. webhook_events 7. activity_log

## Security
- All policies changed to `TO authenticated` with `auth.uid() = user_id`.
- profiles: users read/update only their own row.
- SECURITY DEFINER trigger `handle_new_user()` auto-creates profile on signup.

## Notes
- Existing seed rows have user_id = NULL; they are invisible to authenticated
  users (NULL never matches auth.uid()). New users start with a clean slate.
- `DEFAULT auth.uid()` ensures new inserts get an owner automatically.
- Columns are nullable because the existing seed data has no owner. New
  inserts from authenticated sessions always get a user_id via the default.
*/

-- ============ profiles table ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text DEFAULT '',
  company text DEFAULT '',
  avatar_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============ Auto-create profile on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ Add user_id to all existing tables (nullable for back compat) ============
DO $$ BEGIN
  ALTER TABLE contracts ADD COLUMN user_id uuid DEFAULT auth.uid();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE clause_flags ADD COLUMN user_id uuid DEFAULT auth.uid();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE contract_terms ADD COLUMN user_id uuid DEFAULT auth.uid();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE invoices ADD COLUMN user_id uuid DEFAULT auth.uid();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE email_drafts ADD COLUMN user_id uuid DEFAULT auth.uid();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE webhook_events ADD COLUMN user_id uuid DEFAULT auth.uid();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE activity_log ADD COLUMN user_id uuid DEFAULT auth.uid();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Indexes for user_id filtering
CREATE INDEX IF NOT EXISTS idx_contracts_user ON contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_clause_flags_user ON clause_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_terms_user ON contract_terms(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_user ON email_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_user ON webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);

-- ============ Replace ALL policies with authenticated-only ownership checks ============

-- contracts
DROP POLICY IF EXISTS "contracts_select" ON contracts;
CREATE POLICY "contracts_select" ON contracts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "contracts_insert" ON contracts;
CREATE POLICY "contracts_insert" ON contracts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "contracts_update" ON contracts;
CREATE POLICY "contracts_update" ON contracts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "contracts_delete" ON contracts;
CREATE POLICY "contracts_delete" ON contracts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- clause_flags
DROP POLICY IF EXISTS "clause_flags_select" ON clause_flags;
CREATE POLICY "clause_flags_select" ON clause_flags FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "clause_flags_insert" ON clause_flags;
CREATE POLICY "clause_flags_insert" ON clause_flags FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "clause_flags_update" ON clause_flags;
CREATE POLICY "clause_flags_update" ON clause_flags FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "clause_flags_delete" ON clause_flags;
CREATE POLICY "clause_flags_delete" ON clause_flags FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- contract_terms
DROP POLICY IF EXISTS "contract_terms_select" ON contract_terms;
CREATE POLICY "contract_terms_select" ON contract_terms FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "contract_terms_insert" ON contract_terms;
CREATE POLICY "contract_terms_insert" ON contract_terms FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "contract_terms_update" ON contract_terms;
CREATE POLICY "contract_terms_update" ON contract_terms FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "contract_terms_delete" ON contract_terms;
CREATE POLICY "contract_terms_delete" ON contract_terms FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- invoices
DROP POLICY IF EXISTS "invoices_select" ON invoices;
CREATE POLICY "invoices_select" ON invoices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
CREATE POLICY "invoices_insert" ON invoices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "invoices_update" ON invoices;
CREATE POLICY "invoices_update" ON invoices FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "invoices_delete" ON invoices;
CREATE POLICY "invoices_delete" ON invoices FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- email_drafts
DROP POLICY IF EXISTS "email_drafts_select" ON email_drafts;
CREATE POLICY "email_drafts_select" ON email_drafts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "email_drafts_insert" ON email_drafts;
CREATE POLICY "email_drafts_insert" ON email_drafts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "email_drafts_update" ON email_drafts;
CREATE POLICY "email_drafts_update" ON email_drafts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "email_drafts_delete" ON email_drafts;
CREATE POLICY "email_drafts_delete" ON email_drafts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- webhook_events
DROP POLICY IF EXISTS "webhook_events_select" ON webhook_events;
CREATE POLICY "webhook_events_select" ON webhook_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "webhook_events_insert" ON webhook_events;
CREATE POLICY "webhook_events_insert" ON webhook_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "webhook_events_update" ON webhook_events;
CREATE POLICY "webhook_events_update" ON webhook_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "webhook_events_delete" ON webhook_events;
CREATE POLICY "webhook_events_delete" ON webhook_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- activity_log
DROP POLICY IF EXISTS "activity_log_select" ON activity_log;
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "activity_log_insert" ON activity_log;
CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "activity_log_update" ON activity_log;
CREATE POLICY "activity_log_update" ON activity_log FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "activity_log_delete" ON activity_log;
CREATE POLICY "activity_log_delete" ON activity_log FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ Seed function for new users ============
-- Called by the edge function after signup to give new users demo data
CREATE OR REPLACE FUNCTION seed_demo_data_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_acme uuid;
  v_lumen uuid;
  v_northwind uuid;
BEGIN
  -- Contracts
  INSERT INTO contracts (id, user_id, title, client, page_count, status, risk_score, total_value, uploaded_at)
  VALUES
    (gen_random_uuid(), p_user_id, 'Master Services Agreement — Acme Studio', 'Acme Studio', 18, 'scanned', 72, 14500, '2026-07-14'),
    (gen_random_uuid(), p_user_id, 'MSA — Lumen Digital', 'Lumen Digital', 12, 'scanned', 28, 8200, '2026-07-22'),
    (gen_random_uuid(), p_user_id, 'Consulting Agreement — Northwind Labs', 'Northwind Labs', 9, 'processing', 0, 0, '2026-08-01')
  RETURNING id INTO v_acme, v_lumen, v_northwind;

  -- Clause flags for Acme
  INSERT INTO clause_flags (contract_id, user_id, level, title, excerpt, plain_english, pushback, clause_ref)
  VALUES
    (v_acme, p_user_id, 'high', 'Unlimited revisions at no cost',
      'Contractor agrees to provide unlimited revisions to all deliverables at no additional fee until Client is reasonably satisfied.',
      'You are on the hook for endless rework with no extra pay and no cap.',
      'Cap revisions at 2 rounds per deliverable, with additional rounds billed hourly.', '§4.3'),
    (v_acme, p_user_id, 'high', 'Payment terms: Net-60 with no late penalty',
      'Client shall remit payment within sixty (60) days of invoice receipt. No late fees or interest shall apply.',
      'They can sit on your invoice for 2 full months with zero penalty.',
      'Request Net-30 terms and a 1.5% monthly late fee after the due date.', '§6.1'),
    (v_acme, p_user_id, 'medium', 'Broad IP assignment before final payment',
      'All intellectual property rights shall transfer to Client upon delivery of deliverables, regardless of payment status.',
      'They own your work the moment you hand it over — even if they never pay.',
      'IP should transfer only after full payment is received.', '§7.2'),
    (v_acme, p_user_id, 'low', 'Vague scope definition',
      'Contractor will perform such additional services as Client may reasonably request from time to time.',
      'Opens the door to scope creep — undefined and unbounded.',
      'Replace with a defined scope of work and a change-order process.', '§3.5');

  -- Clause flag for Lumen
  INSERT INTO clause_flags (contract_id, user_id, level, title, excerpt, plain_english, pushback, clause_ref)
  VALUES
    (v_lumen, p_user_id, 'low', 'Non-compete is unusually broad',
      'Contractor shall not engage with any Client competitor for 12 months following termination across all industries served.',
      'Overly broad and likely unenforceable, but still a flag.',
      'Narrow to same industry and region, reduce to 6 months.', '§10.2');

  -- Terms for Acme
  INSERT INTO contract_terms (contract_id, user_id, label, value, category, source)
  VALUES
    (v_acme, p_user_id, 'Payment schedule', '50% upfront, 50% on delivery', 'payment', '§6.1'),
    (v_acme, p_user_id, 'Net terms', 'Net-60', 'payment', '§6.1'),
    (v_acme, p_user_id, 'Late fee', 'None specified', 'payment', '§6.1'),
    (v_acme, p_user_id, 'Revision rounds', 'Unlimited', 'scope', '§4.3'),
    (v_acme, p_user_id, 'Project deadline', 'September 30, 2026', 'deadline', '§2.1'),
    (v_acme, p_user_id, 'IP ownership', 'Transfers on delivery (pre-payment)', 'ip', '§7.2'),
    (v_acme, p_user_id, 'Termination notice', '14 days written', 'termination', '§9.1'),
    (v_acme, p_user_id, 'Liability cap', 'Fees paid in last 3 months', 'liability', '§11.3');

  -- Terms for Lumen
  INSERT INTO contract_terms (contract_id, user_id, label, value, category, source)
  VALUES
    (v_lumen, p_user_id, 'Payment schedule', 'Monthly invoicing', 'payment', '§5.1'),
    (v_lumen, p_user_id, 'Net terms', 'Net-30', 'payment', '§5.1'),
    (v_lumen, p_user_id, 'Late fee', '1.5% per month', 'payment', '§5.3'),
    (v_lumen, p_user_id, 'Revision rounds', '2 rounds per deliverable', 'scope', '§3.4'),
    (v_lumen, p_user_id, 'Project deadline', 'Rolling monthly', 'deadline', '§2.2'),
    (v_lumen, p_user_id, 'IP ownership', 'Transfers on full payment', 'ip', '§6.1'),
    (v_lumen, p_user_id, 'Termination notice', '30 days written', 'termination', '§8.1'),
    (v_lumen, p_user_id, 'Liability cap', 'Total project fees', 'liability', '§10.1');

  -- Invoices
  INSERT INTO invoices (user_id, number, client, contract_id, amount, issued_at, due_at, status, days_late)
  VALUES
    (p_user_id, 'INV-2026-014', 'Acme Studio', v_acme, 7250, '2026-06-28', '2026-07-28', 'overdue', 9),
    (p_user_id, 'INV-2026-015', 'Acme Studio', v_acme, 7250, '2026-07-30', '2026-08-29', 'sent', 0),
    (p_user_id, 'INV-2026-021', 'Lumen Digital', v_lumen, 4100, '2026-07-01', '2026-07-31', 'overdue', 6),
    (p_user_id, 'INV-2026-022', 'Lumen Digital', v_lumen, 4100, '2026-08-01', '2026-08-31', 'sent', 0),
    (p_user_id, 'INV-2026-009', 'Lumen Digital', v_lumen, 4100, '2026-06-01', '2026-07-01', 'paid', 0);

  -- Activity log
  INSERT INTO activity_log (user_id, event_type, description, severity)
  VALUES
    (p_user_id, 'contract_scanned', 'Master Services Agreement — Acme Studio scanned: 4 flags, 8 terms extracted', 'warning'),
    (p_user_id, 'contract_scanned', 'MSA — Lumen Digital scanned: 1 flag, 8 terms extracted', 'success'),
    (p_user_id, 'invoice_overdue', 'INV-2026-014 (Acme Studio) is 9 days overdue — $7,250 outstanding', 'error');
END;
$$;
