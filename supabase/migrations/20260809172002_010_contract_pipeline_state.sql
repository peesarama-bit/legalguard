-- Add extraction/analysis state columns to contracts
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS file_size bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mime_type text DEFAULT '',
  ADD COLUMN IF NOT EXISTS extraction_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS analysis_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS contract_type text DEFAULT '',
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_method text DEFAULT '',
  ADD COLUMN IF NOT EXISTS native_text_pages int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ocr_pages int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_extracted_chars int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_words int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chunk_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extraction_duration_ms int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ocr_duration_ms int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_duration_ms int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_pages text DEFAULT '',
  ADD COLUMN IF NOT EXISTS extraction_confidence float DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_error text DEFAULT '';

-- Add source page and confidence to clause_flags
ALTER TABLE clause_flags
  ADD COLUMN IF NOT EXISTS source_page int,
  ADD COLUMN IF NOT EXISTS category text DEFAULT '',
  ADD COLUMN IF NOT EXISTS confidence float DEFAULT 0;

-- Add source page, confidence, and status to contract_terms
ALTER TABLE contract_terms
  ADD COLUMN IF NOT EXISTS source_page int,
  ADD COLUMN IF NOT EXISTS confidence float DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'found';

-- Create contract_pages table for per-page extraction data
CREATE TABLE IF NOT EXISTS contract_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id uuid DEFAULT auth.uid(),
  page_number int NOT NULL,
  text text DEFAULT '',
  extraction_method text DEFAULT 'native',
  ocr_confidence float DEFAULT 0,
  char_count int DEFAULT 0,
  word_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contract_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_pages" ON contract_pages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_pages" ON contract_pages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_pages" ON contract_pages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Create analysis_runs table for tracking pipeline stages
CREATE TABLE IF NOT EXISTS analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id uuid DEFAULT auth.uid(),
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text DEFAULT '',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_runs" ON analysis_runs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_runs" ON analysis_runs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_runs" ON analysis_runs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "delete_own_runs" ON analysis_runs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_contract_pages_contract ON contract_pages(contract_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_contract ON analysis_runs(contract_id);