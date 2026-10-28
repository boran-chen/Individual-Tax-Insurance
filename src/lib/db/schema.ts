export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','PROVINCE')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL,
  province_code TEXT,
  type TEXT NOT NULL DEFAULT 'PROVINCE',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED'))
);

CREATE TABLE IF NOT EXISTS user_organizations (
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  effective_from TEXT,
  effective_to TEXT,
  PRIMARY KEY (user_id, org_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_orgs_org ON user_organizations(org_id);

CREATE TABLE IF NOT EXISTS province_mappings (
  id TEXT PRIMARY KEY,
  source_value TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS staging_uploads (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  preview_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','PROCESSING','DRAFT','PUBLISHED','SUPERSEDED','VOIDED','FAILED')),
  original_file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  field_mapping_json TEXT NOT NULL DEFAULT '{}',
  source_sheet TEXT,
  header_row INTEGER,
  source_headers_json TEXT NOT NULL DEFAULT '[]',
  stats_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  published_at TEXT,
  voided_at TEXT,
  replaced_by TEXT,
  UNIQUE (month, version),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_batches_month_status ON batches(month, status);

CREATE TABLE IF NOT EXISTS source_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  raw_json_enc TEXT NOT NULL,
  name TEXT,
  id_type TEXT,
  id_number_enc TEXT,
  id_fingerprint TEXT,
  id_mask TEXT,
  taxable_income_cents INTEGER,
  taxable_income_text TEXT,
  entry_month TEXT,
  entry_month_raw TEXT,
  org_raw TEXT,
  org_id TEXT,
  valid_status TEXT NOT NULL,
  anomaly_codes_json TEXT NOT NULL DEFAULT '[]',
  dedupe_fingerprint TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_source_batch_org ON source_rows(batch_id, org_id);
CREATE INDEX IF NOT EXISTS idx_source_batch_status ON source_rows(batch_id, valid_status);
CREATE INDEX IF NOT EXISTS idx_source_batch_entry ON source_rows(batch_id, entry_month);
CREATE INDEX IF NOT EXISTS idx_source_fingerprint ON source_rows(batch_id, id_fingerprint);

CREATE TABLE IF NOT EXISTS dataset_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  dataset_type TEXT NOT NULL CHECK (dataset_type IN ('NEW_PERSON','TRANSFER_NON','LABOR_INCOME','SUMMARY')),
  source_row_id TEXT NOT NULL,
  output_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (batch_id, org_id, dataset_type, source_row_id),
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
  FOREIGN KEY (source_row_id) REFERENCES source_rows(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dataset_lookup ON dataset_rows(batch_id, org_id, dataset_type);

CREATE TABLE IF NOT EXISTS export_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  UNIQUE (batch_id, org_id, rule_version),
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS return_tasks (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
  current_submission_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (batch_id, org_id),
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_return_tasks_status ON return_tasks(batch_id, status);

CREATE TABLE IF NOT EXISTS return_submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','COMPARING','PASSED','FAILED','PARSE_ERROR')),
  engine_version TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  matched_rows INTEGER NOT NULL DEFAULT 0,
  diff_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  compared_at TEXT,
  UNIQUE (task_id, version),
  FOREIGN KEY (task_id) REFERENCES return_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_submissions_batch_org ON return_submissions(batch_id, org_id, version);

CREATE TABLE IF NOT EXISTS return_rows (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  raw_json_enc TEXT NOT NULL,
  name TEXT,
  id_type TEXT,
  id_number_enc TEXT,
  id_fingerprint TEXT,
  id_mask TEXT,
  income_cents INTEGER,
  income_text TEXT,
  FOREIGN KEY (submission_id) REFERENCES return_submissions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_return_rows_sub ON return_rows(submission_id);

CREATE TABLE IF NOT EXISTS return_diffs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  diff_type TEXT NOT NULL,
  diff_key TEXT NOT NULL,
  source_row_id TEXT,
  source_row_number INTEGER,
  return_row_number INTEGER,
  field_name TEXT,
  original_value TEXT,
  returned_value TEXT,
  message TEXT,
  FOREIGN KEY (submission_id) REFERENCES return_submissions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_diffs_sub ON return_diffs(submission_id, diff_type);

CREATE TABLE IF NOT EXISTS aggregations (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  org_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXCLUDED')),
  record_count INTEGER NOT NULL DEFAULT 0,
  income_cents INTEGER NOT NULL DEFAULT 0,
  aggregated_at TEXT NOT NULL,
  UNIQUE (month, org_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('PROCESS_BATCH','COMPARE_RETURN')),
  object_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  org_id TEXT,
  result TEXT NOT NULL DEFAULT 'SUCCESS',
  context_json TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(org_id, created_at);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
`;
