/*
# LegalGuard: Client commercial memory + payment promises + AI insights + communications

## Overview
Adds the core tables for LegalGuard's AI Commercial Relationship Agent:
- clients: unified commercial profile per client
- client_communications: emails and conversations with clients
- payment_promises: tracked promises to pay (pending/fulfilled/missed)
- ai_insights: AI-generated risk assessments and recommended actions

## New Tables
1. clients — per-client commercial profile
   - name, email, relationship_health, risk_level, total_outstanding, total_overdue
   - avg_payment_delay_days, notes, last_interaction_at
2. client_communications — emails/messages from/to clients
   - client_name, direction (inbound/outbound), subject, body, sentiment,
   - has_payment_discussion, has_dispute, has_promise, processed
3. payment_promises — structured payment commitments
   - client_name, invoice_id, promised_amount, promised_date, status
   - (pending/fulfilled/missed), source_communication_id, notes
4. ai_insights — AI-generated analysis results
   - client_name, insight_type, risk_level, summary, evidence (jsonb),
   - recommended_action, action_type, generated_at

## Security
- All tables have RLS enabled with authenticated-only ownership policies.
- user_id columns default to auth.uid().

## Notes
- The seed_demo_data_for_user function is updated to also seed clients,
  communications, payment promises, and AI insights for demo data.
*/

-- ============ clients ============
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  name text NOT NULL,
  email text DEFAULT '',
  company text DEFAULT '',
  relationship_health text DEFAULT 'good',
  risk_level text DEFAULT 'low',
  total_outstanding numeric DEFAULT 0,
  total_overdue numeric DEFAULT 0,
  avg_payment_delay_days int DEFAULT 0,
  notes text DEFAULT '',
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select" ON clients;
CREATE POLICY "clients_select" ON clients FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "clients_insert" ON clients;
CREATE POLICY "clients_insert" ON clients FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "clients_update" ON clients;
CREATE POLICY "clients_update" ON clients FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "clients_delete" ON clients;
CREATE POLICY "clients_delete" ON clients FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);

-- ============ client_communications ============
CREATE TABLE IF NOT EXISTS client_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  client_name text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound',
  subject text DEFAULT '',
  body text NOT NULL DEFAULT '',
  sentiment text DEFAULT 'neutral',
  has_payment_discussion boolean DEFAULT false,
  has_dispute boolean DEFAULT false,
  has_promise boolean DEFAULT false,
  promise_date date,
  promise_amount numeric,
  processed boolean DEFAULT true,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_communications_select" ON client_communications;
CREATE POLICY "client_communications_select" ON client_communications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "client_communications_insert" ON client_communications;
CREATE POLICY "client_communications_insert" ON client_communications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "client_communications_update" ON client_communications;
CREATE POLICY "client_communications_update" ON client_communications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "client_communications_delete" ON client_communications;
CREATE POLICY "client_communications_delete" ON client_communications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_communications_user ON client_communications(user_id);
CREATE INDEX IF NOT EXISTS idx_communications_client ON client_communications(client_name);

-- ============ payment_promises ============
CREATE TABLE IF NOT EXISTS payment_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  client_name text NOT NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_number text DEFAULT '',
  promised_amount numeric DEFAULT 0,
  promised_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  source_communication_id uuid REFERENCES client_communications(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_promises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_promises_select" ON payment_promises;
CREATE POLICY "payment_promises_select" ON payment_promises FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "payment_promises_insert" ON payment_promises;
CREATE POLICY "payment_promises_insert" ON payment_promises FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "payment_promises_update" ON payment_promises;
CREATE POLICY "payment_promises_update" ON payment_promises FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "payment_promises_delete" ON payment_promises;
CREATE POLICY "payment_promises_delete" ON payment_promises FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_promises_user ON payment_promises(user_id);
CREATE INDEX IF NOT EXISTS idx_promises_status ON payment_promises(status);

-- ============ ai_insights ============
CREATE TABLE IF NOT EXISTS ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  client_name text NOT NULL,
  insight_type text NOT NULL DEFAULT 'risk_assessment',
  risk_level text DEFAULT 'low',
  summary text NOT NULL DEFAULT '',
  evidence jsonb DEFAULT '[]'::jsonb,
  recommended_action text DEFAULT '',
  action_type text DEFAULT 'none',
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_insights_select" ON ai_insights;
CREATE POLICY "ai_insights_select" ON ai_insights FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_insights_insert" ON ai_insights;
CREATE POLICY "ai_insights_insert" ON ai_insights FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_insights_update" ON ai_insights;
CREATE POLICY "ai_insights_update" ON ai_insights FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_insights_delete" ON ai_insights;
CREATE POLICY "ai_insights_delete" ON ai_insights FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_insights_user ON ai_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_client ON ai_insights(client_name);

-- ============ Update seed function to include new tables ============
CREATE OR REPLACE FUNCTION seed_demo_data_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_acme uuid;
  v_lumen uuid;
  v_northwind uuid;
  v_acme_client uuid;
  v_lumen_client uuid;
  v_acme_comm1 uuid;
  v_acme_comm2 uuid;
  v_lumen_comm1 uuid;
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
      'You are on the hook for endless rework with no extra pay and no cap.', 'Cap revisions at 2 rounds per deliverable, with additional rounds billed hourly.', '§4.3'),
    (v_acme, p_user_id, 'high', 'Payment terms: Net-60 with no late penalty',
      'Client shall remit payment within sixty (60) days of invoice receipt. No late fees or interest shall apply.',
      'They can sit on your invoice for 2 full months with zero penalty.', 'Request Net-30 terms and a 1.5% monthly late fee after the due date.', '§6.1'),
    (v_acme, p_user_id, 'medium', 'Broad IP assignment before final payment',
      'All intellectual property rights shall transfer to Client upon delivery of deliverables, regardless of payment status.',
      'They own your work the moment you hand it over — even if they never pay.', 'IP should transfer only after full payment is received.', '§7.2'),
    (v_acme, p_user_id, 'low', 'Vague scope definition',
      'Contractor will perform such additional services as Client may reasonably request from time to time.',
      'Opens the door to scope creep — undefined and unbounded.', 'Replace with a defined scope of work and a change-order process.', '§3.5');

  -- Clause flag for Lumen
  INSERT INTO clause_flags (contract_id, user_id, level, title, excerpt, plain_english, pushback, clause_ref)
  VALUES
    (v_lumen, p_user_id, 'low', 'Non-compete is unusually broad',
      'Contractor shall not engage with any Client competitor for 12 months following termination across all industries served.',
      'Overly broad and likely unenforceable, but still a flag.', 'Narrow to same industry and region, reduce to 6 months.', '§10.2');

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
    (p_user_id, 'INV-2026-009', 'Lumen Digital', v_lumen, 4100, '2026-06-01', '2026-07-01', 'paid', 0)
  RETURNING id INTO v_acme; -- not needed but syntax requires it

  -- Activity log
  INSERT INTO activity_log (user_id, event_type, description, severity)
  VALUES
    (p_user_id, 'contract_scanned', 'Master Services Agreement — Acme Studio scanned: 4 flags, 8 terms extracted', 'warning'),
    (p_user_id, 'contract_scanned', 'MSA — Lumen Digital scanned: 1 flag, 8 terms extracted', 'success'),
    (p_user_id, 'invoice_overdue', 'INV-2026-014 (Acme Studio) is 9 days overdue — $7,250 outstanding', 'error');

  -- ====== NEW: Clients ======
  INSERT INTO clients (id, user_id, name, email, company, relationship_health, risk_level, total_outstanding, total_overdue, avg_payment_delay_days, notes, last_interaction_at)
  VALUES
    (gen_random_uuid(), p_user_id, 'Acme Studio', 'jordan@acmestudio.com', 'Acme Studio Inc', 'strained', 'high', 14500, 7250, 9, 'Long-standing client. Recent disputes over deliverable approval. Payment behavior declining.', '2026-08-05'),
    (gen_random_uuid(), p_user_id, 'Lumen Digital', 'sarah@lumendigital.io', 'Lumen Digital LLC', 'good', 'medium', 8200, 4100, 6, 'Reliable client. Slight delay on last invoice but generally pays within terms.', '2026-08-03')
  RETURNING id INTO v_acme_client, v_lumen_client;

  -- ====== NEW: Client communications ======
  INSERT INTO client_communications (id, user_id, client_name, direction, subject, body, sentiment, has_payment_discussion, has_dispute, has_promise, promise_date, promise_amount, received_at)
  VALUES
    (gen_random_uuid(), p_user_id, 'Acme Studio', 'inbound', 'Re: Invoice INV-2026-014 — quick question',
      'Hi Alex,\n\nThanks for the invoice. Before we process payment, we are still waiting for the final dashboard to be approved by our team. Once that is sorted, finance should be able to pay.\n\nCould you also make a small change to the color scheme? Should be quick.\n\nThanks,\nJordan',
      'negative', true, true, false, NULL, NULL, '2026-08-05')
  RETURNING id INTO v_acme_comm1;

  INSERT INTO client_communications (id, user_id, client_name, direction, subject, body, sentiment, has_payment_discussion, has_dispute, has_promise, promise_date, promise_amount, received_at)
  VALUES
    (gen_random_uuid(), p_user_id, 'Acme Studio', 'inbound', 'Re: Following up on payment',
      'Hi Alex,\n\nI spoke with finance and they said they will process the payment next Friday, August 15th. Sorry for the delay!\n\nBest,\nJordan',
      'positive', true, false, true, '2026-08-15', 7250, '2026-08-06')
  RETURNING id INTO v_acme_comm2;

  INSERT INTO client_communications (id, user_id, client_name, direction, subject, body, sentiment, has_payment_discussion, has_dispute, has_promise, promise_date, promise_amount, received_at)
  VALUES
    (gen_random_uuid(), p_user_id, 'Lumen Digital', 'inbound', 'Re: Invoice INV-2026-021',
      'Hi Alex,\n\nGot the invoice — will get this processed by end of week. No issues on our end.\n\nThanks,\nSarah',
      'positive', true, false, true, '2026-08-09', 4100, '2026-08-03')
  RETURNING id INTO v_lumen_comm1;

  -- ====== NEW: Payment promises ======
  INSERT INTO payment_promises (user_id, client_name, invoice_number, promised_amount, promised_date, status, source_communication_id, notes)
  VALUES
    (p_user_id, 'Acme Studio', 'INV-2026-014', 7250, '2026-08-15', 'pending', v_acme_comm2, 'Client promised to pay next Friday. Contract has Net-60 terms with no late fee.'),
    (p_user_id, 'Lumen Digital', 'INV-2026-021', 4100, '2026-08-09', 'pending', v_lumen_comm1, 'Client said finance will process by end of week.');

  -- ====== NEW: AI insights ======
  INSERT INTO ai_insights (user_id, client_name, insight_type, risk_level, summary, evidence, recommended_action, action_type)
  VALUES
    (p_user_id, 'Acme Studio', 'risk_assessment', 'high',
      'Invoice INV-2026-014 is 9 days overdue. The client is disputing a deliverable (final dashboard approval) and the contract links payment to milestone acceptance. The client also promised to pay on August 15th. Sending an aggressive collection email now would damage the relationship. Resolve the deliverable dispute first.',
      '["Invoice overdue by 9 days ($7,250)", "Client mentioned waiting for dashboard approval", "Contract has milestone-linked payment terms", "Payment promise made for Aug 15", "Relationship health: strained", "Historical avg delay: 9 days"]'::jsonb,
      'Contact the client regarding the outstanding dashboard deliverable. Do NOT send a payment escalation until the deliverable is resolved and the Aug 15 promise date has passed.',
      'clarification'),
    (p_user_id, 'Lumen Digital', 'risk_assessment', 'medium',
      'Invoice INV-2026-021 is 6 days overdue but the client has confirmed no issues and promised to pay by August 9th. The relationship is healthy. A gentle reminder is appropriate if payment is not received by the promised date.',
      '["Invoice overdue by 6 days ($4,100)", "Client confirmed no issues", "Payment promise made for Aug 9", "Relationship health: good", "Historical avg delay: 6 days"]'::jsonb,
      'Wait until Aug 9. If payment not received, send a gentle reminder referencing the promise.',
      'reminder');
END;
$$;
