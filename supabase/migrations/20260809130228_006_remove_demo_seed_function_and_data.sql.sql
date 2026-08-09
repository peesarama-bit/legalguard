-- Drop the demo seed function — new users start with clean accounts
DROP FUNCTION IF EXISTS seed_demo_data_for_user(uuid);

-- Remove the original NULL-user_id seed data (from migration 002)
-- These rows are invisible to authenticated users but shouldn't linger
DELETE FROM activity_log WHERE user_id IS NULL;
DELETE FROM clause_flags WHERE contract_id IN (SELECT id FROM contracts WHERE user_id IS NULL);
DELETE FROM contract_terms WHERE contract_id IN (SELECT id FROM contracts WHERE user_id IS NULL);
DELETE FROM invoices WHERE user_id IS NULL;
DELETE FROM contracts WHERE user_id IS NULL;
