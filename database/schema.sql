CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          VARCHAR(36)  NOT NULL,
  employee_id VARCHAR(36)  NOT NULL,
  token       TEXT         NOT NULL,
  expires_at  DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_refresh_tokens_employee_id (employee_id)
);
