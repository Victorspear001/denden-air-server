-- ============================================================
-- Denden Air — Migration 002: Add message_type column
-- Separates WhatsApp notifications from SMS messages
-- ============================================================

-- Add message_type column (defaults to 'sms' for backwards compatibility)
ALTER TABLE sms_logs ADD COLUMN message_type TEXT DEFAULT 'sms';

-- Index for fast filtering by message type
CREATE INDEX IF NOT EXISTS idx_sms_logs_message_type ON sms_logs(message_type);

-- Backfill: mark existing WhatsApp messages based on sender_identity prefix
UPDATE sms_logs SET message_type = 'whatsapp' WHERE sender_identity LIKE '[WhatsApp]%'
