export const draftStoreSchema = `
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    request_hash TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    last_error TEXT,
    report_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS outbox_due_idx ON outbox(status, next_attempt_at);
  CREATE TABLE IF NOT EXISTS capture_annotations (
    id TEXT PRIMARY KEY,
    page_url TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    rendered_png BLOB NOT NULL,
    source_png BLOB
  );
  CREATE INDEX IF NOT EXISTS capture_annotations_page_idx
    ON capture_annotations(page_url, created_at);
  CREATE TABLE IF NOT EXISTS element_comments (
    id TEXT PRIMARY KEY,
    page_url TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS element_comments_page_idx
    ON element_comments(page_url, created_at);
  CREATE TABLE IF NOT EXISTS diagnostic_annotations (
    id TEXT PRIMARY KEY,
    page_url TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS diagnostic_annotations_page_idx
    ON diagnostic_annotations(page_url, created_at);
  CREATE TABLE IF NOT EXISTS annotation_submissions (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    project_id TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS annotation_submissions_date_idx
    ON annotation_submissions(submitted_at);
  CREATE TABLE IF NOT EXISTS submission_capture_images (
    submission_id TEXT NOT NULL,
    capture_id TEXT NOT NULL,
    rendered_png BLOB NOT NULL,
    source_png BLOB,
    PRIMARY KEY (submission_id, capture_id),
    FOREIGN KEY (submission_id) REFERENCES annotation_submissions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS website_projects (
    id TEXT PRIMARY KEY,
    origin TEXT NOT NULL UNIQUE,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS website_projects_updated_idx
    ON website_projects(updated_at);
  CREATE TABLE IF NOT EXISTS page_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    page_url TEXT NOT NULL,
    page_title TEXT NOT NULL,
    visited_at TEXT NOT NULL,
    UNIQUE(project_id, page_url)
  );
  CREATE INDEX IF NOT EXISTS page_sessions_project_idx
    ON page_sessions(project_id, visited_at);
  CREATE TABLE IF NOT EXISTS project_navigation (
    project_id TEXT PRIMARY KEY,
    entries TEXT NOT NULL,
    current_index INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS capture_annotations_project_idx
    ON capture_annotations(project_id, status, created_at);
  CREATE INDEX IF NOT EXISTS element_comments_project_idx
    ON element_comments(project_id, status, created_at);
  CREATE INDEX IF NOT EXISTS diagnostic_annotations_project_idx
    ON diagnostic_annotations(project_id, status, created_at);
  CREATE INDEX IF NOT EXISTS annotation_submissions_project_idx
    ON annotation_submissions(project_id, submitted_at);
`;
