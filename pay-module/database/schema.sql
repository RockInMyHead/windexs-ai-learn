-- Payment Module Database Schema
-- Compatible with SQLite, PostgreSQL, MySQL

-- Users table (may already exist in main app)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  yookassa_payment_id TEXT,
  started_at INTEGER NOT NULL,
  expires_at INTEGER, -- For monthly subscriptions
  auto_renew INTEGER NOT NULL DEFAULT 1,
  audio_sessions_limit INTEGER,
  audio_sessions_used INTEGER DEFAULT 0,
  meditation_access INTEGER DEFAULT 0,
  free_sessions_remaining INTEGER DEFAULT 0,
  last_audio_reset_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Payments log table (for tracking all payments)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  yookassa_id TEXT UNIQUE,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL,
  plan TEXT,
  description TEXT,
  metadata TEXT, -- JSON string for additional data
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Refunds table (optional, for refund tracking)
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  yookassa_refund_id TEXT UNIQUE,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);

-- Webhook logs table (for debugging webhook issues)
CREATE TABLE IF NOT EXISTS webhook_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payment_id TEXT,
  user_id TEXT,
  raw_data TEXT, -- JSON string of webhook payload
  processed INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_yookassa_id ON payments(yookassa_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_yookassa_refund_id ON refunds(yookassa_refund_id);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_payment_id ON webhook_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON webhook_logs(processed);

-- Views for analytics
CREATE VIEW IF NOT EXISTS active_subscriptions AS
SELECT
  s.*,
  u.name as user_name,
  u.email as user_email,
  CASE
    WHEN s.plan = 'free_trial' THEN s.free_sessions_remaining
    WHEN s.audio_sessions_limit IS NOT NULL THEN (s.audio_sessions_limit - s.audio_sessions_used)
    ELSE 0
  END as remaining_sessions
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.status = 'active'
  AND (s.expires_at IS NULL OR s.expires_at > strftime('%s', 'now') * 1000);

CREATE VIEW IF NOT EXISTS payment_summary AS
SELECT
  DATE(created_at / 1000, 'unixepoch', 'localtime') as date,
  COUNT(*) as total_payments,
  SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as successful_amount,
  SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as successful_count,
  AVG(CASE WHEN status = 'succeeded' THEN amount ELSE NULL END) as avg_payment
FROM payments
GROUP BY DATE(created_at / 1000, 'unixepoch', 'localtime')
ORDER BY date DESC;

-- Sample data for testing
-- INSERT OR IGNORE INTO users (id, name, email, created_at, updated_at) VALUES
--   ('user_test_001', 'Тестовый Пользователь', 'test@example.com', 1700000000000, 1700000000000);

-- INSERT OR IGNORE INTO subscriptions (id, user_id, plan, status, audio_sessions_limit, created_at, updated_at) VALUES
--   ('sub_test_001', 'user_test_001', 'free_trial', 'active', 3, 1700000000000, 1700000000000);</contents>
</xai:function_call">Создаю схему базы данных для модуля оплаты
