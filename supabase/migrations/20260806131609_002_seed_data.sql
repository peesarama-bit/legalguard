/*
# Seed initial demo data

## Overview
Populates the database with two scanned contracts (with clause flags and
extracted terms), one processing contract, five invoices (including overdue
ones), and initial activity log entries — so the app has rich data on first
load. All inserts are idempotent via ON CONFLICT DO NOTHING.

## Tables affected
- contracts (3 rows)
- clause_flags (5 rows for c_acme, 1 for c_lumen)
- contract_terms (8 for c_acme, 8 for c_lumen)
- invoices (5 rows)
- activity_log (3 initial entries)
*/

-- Use fixed UUIDs so child inserts can reference them
DO $$
DECLARE
  v_acme uuid := 'a0000000-0000-0000-0000-000000000001';
  v_lumen uuid := 'a0000000-0000-0000-0000-000000000002';
  v_northwind uuid := 'a0000000-0000-0000-0000-000000000003';
BEGIN
  -- Contracts
  INSERT INTO contracts (id, title, client, page_count, status, risk_score, total_value, uploaded_at)
  VALUES
    (v_acme, 'Master Services Agreement — Acme Studio', 'Acme Studio', 18, 'scanned', 72, 14500, '2026-07-14'),
    (v_lumen, 'MSA — Lumen Digital', 'Lumen Digital', 12, 'scanned', 28, 8200, '2026-07-22'),
    (v_northwind, 'Consulting Agreement — Northwind Labs', 'Northwind Labs', 9, 'processing', 0, 0, '2026-08-01')
  ON CONFLICT (id) DO NOTHING;

  -- Clause flags for Acme
  INSERT INTO clause_flags (contract_id, level, title, excerpt, plain_english, pushback, clause_ref)
  VALUES
    (v_acme, 'high', 'Unlimited revisions at no cost',
      'Contractor agrees to provide unlimited revisions to all deliverables at no additional fee until Client is reasonably satisfied.',
      'You are on the hook for endless rework with no extra pay and no cap. "Reasonably satisfied" is subjective — this can drag on forever.',
      'Suggest capping revisions at 2 rounds per deliverable, with additional rounds billed at $X/hr.',
      '§4.3'),
    (v_acme, 'high', 'Payment terms: Net-60 with no late penalty',
      'Client shall remit payment within sixty (60) days of invoice receipt. No late fees or interest shall apply.',
      'They can sit on your invoice for 2 full months with zero penalty. Net-60 with no late fee removes any urgency to pay.',
      'Request Net-30 terms and a 1.5% monthly late fee after the due date.',
      '§6.1'),
    (v_acme, 'medium', 'Broad IP assignment before final payment',
      'All intellectual property rights shall transfer to Client upon delivery of deliverables, regardless of payment status.',
      'They own your work the moment you hand it over — even if they never pay. You lose your leverage.',
      'IP should transfer only after full payment is received. Add "upon receipt of full payment" to §7.2.',
      '§7.2'),
    (v_acme, 'low', 'Vague scope definition',
      'Contractor will perform such additional services as Client may reasonably request from time to time.',
      'This opens the door to scope creep — "reasonably request" is undefined and unbounded.',
      'Replace with a defined scope of work and a change-order process for anything beyond it.',
      '§3.5')
  ON CONFLICT DO NOTHING;

  -- Clause flag for Lumen
  INSERT INTO clause_flags (contract_id, level, title, excerpt, plain_english, pushback, clause_ref)
  VALUES
    (v_lumen, 'low', 'Non-compete is unusually broad',
      'Contractor shall not engage with any Client competitor for 12 months following termination across all industries served.',
      'A 12-month, all-industries non-compete is overly broad and likely unenforceable, but still a flag.',
      'Narrow to the same industry and region, and reduce to 6 months.',
      '§10.2')
  ON CONFLICT DO NOTHING;

  -- Terms for Acme
  INSERT INTO contract_terms (contract_id, label, value, category, source)
  VALUES
    (v_acme, 'Payment schedule', '50% upfront, 50% on delivery', 'payment', '§6.1'),
    (v_acme, 'Net terms', 'Net-60', 'payment', '§6.1'),
    (v_acme, 'Late fee', 'None specified', 'payment', '§6.1'),
    (v_acme, 'Revision rounds', 'Unlimited', 'scope', '§4.3'),
    (v_acme, 'Project deadline', 'September 30, 2026', 'deadline', '§2.1'),
    (v_acme, 'IP ownership', 'Transfers on delivery (pre-payment)', 'ip', '§7.2'),
    (v_acme, 'Termination notice', '14 days written', 'termination', '§9.1'),
    (v_acme, 'Liability cap', 'Fees paid in last 3 months', 'liability', '§11.3')
  ON CONFLICT DO NOTHING;

  -- Terms for Lumen
  INSERT INTO contract_terms (contract_id, label, value, category, source)
  VALUES
    (v_lumen, 'Payment schedule', 'Monthly invoicing', 'payment', '§5.1'),
    (v_lumen, 'Net terms', 'Net-30', 'payment', '§5.1'),
    (v_lumen, 'Late fee', '1.5% per month', 'payment', '§5.3'),
    (v_lumen, 'Revision rounds', '2 rounds per deliverable', 'scope', '§3.4'),
    (v_lumen, 'Project deadline', 'Rolling monthly', 'deadline', '§2.2'),
    (v_lumen, 'IP ownership', 'Transfers on full payment', 'ip', '§6.1'),
    (v_lumen, 'Termination notice', '30 days written', 'termination', '§8.1'),
    (v_lumen, 'Liability cap', 'Total project fees', 'liability', '§10.1')
  ON CONFLICT DO NOTHING;

  -- Invoices
  INSERT INTO invoices (id, number, client, contract_id, amount, issued_at, due_at, status, days_late)
  VALUES
    ('b0000000-0000-0000-0000-000000000001', 'INV-2026-014', 'Acme Studio', v_acme, 7250, '2026-06-28', '2026-07-28', 'overdue', 9),
    ('b0000000-0000-0000-0000-000000000002', 'INV-2026-015', 'Acme Studio', v_acme, 7250, '2026-07-30', '2026-08-29', 'sent', 0),
    ('b0000000-0000-0000-0000-000000000003', 'INV-2026-021', 'Lumen Digital', v_lumen, 4100, '2026-07-01', '2026-07-31', 'overdue', 6),
    ('b0000000-0000-0000-0000-000000000004', 'INV-2026-022', 'Lumen Digital', v_lumen, 4100, '2026-08-01', '2026-08-31', 'sent', 0),
    ('b0000000-0000-0000-0000-000000000005', 'INV-2026-009', 'Lumen Digital', v_lumen, 4100, '2026-06-01', '2026-07-01', 'paid', 0)
  ON CONFLICT (id) DO NOTHING;

  -- Initial activity log
  INSERT INTO activity_log (event_type, description, severity)
  VALUES
    ('contract_scanned', 'Master Services Agreement — Acme Studio scanned: 4 flags, 8 terms extracted', 'warning'),
    ('contract_scanned', 'MSA — Lumen Digital scanned: 1 flag, 8 terms extracted', 'success'),
    ('invoice_overdue', 'INV-2026-014 (Acme Studio) is 9 days overdue — $7,250 outstanding', 'error')
  ON CONFLICT DO NOTHING;
END $$;
