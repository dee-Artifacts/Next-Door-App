-- ============================================================================
-- Next Door — Supabase Postgres Schema
-- Converted from Cloudflare D1 (SQLite) migrations 1-57
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  avatar_url TEXT,
  room_number TEXT,
  bio TEXT,
  description TEXT,
  creator_image_url TEXT,
  creator_link TEXT,
  is_admin BOOLEAN DEFAULT false,
  is_online BOOLEAN DEFAULT false,
  is_active INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT false,
  is_guest BOOLEAN DEFAULT false,
  profile_completed BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  last_read_message_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_is_guest ON users(is_guest);

-- ============================================================================
-- MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  group_id TEXT DEFAULT 'main',
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  is_pinned BOOLEAN DEFAULT false,
  reply_to_message_id BIGINT,
  event_id BIGINT,
  listing_id BIGINT,
  hashtag_id BIGINT,
  hashtag_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);

-- ============================================================================
-- REACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS reactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);

-- ============================================================================
-- ATTACHMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS attachments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id BIGINT NOT NULL,
  filename TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);

-- ============================================================================
-- MESSAGE READS
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_reads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user_id ON message_reads(user_id);

-- ============================================================================
-- HASHTAGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS hashtags (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  emoji TEXT,
  is_standard BOOLEAN DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Standard hashtags
INSERT INTO hashtags (name, emoji, created_by, is_standard) VALUES
  ('Announcement', '📢', 'system', true),
  ('Event', '⚡', 'system', true),
  ('Support', '🤝', 'system', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SYSTEM MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT,
  message TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_messages_created_at ON system_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_system_messages_type ON system_messages(type);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  message_id BIGINT,
  mentioned_by_user_id TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- ============================================================================
-- APP SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('email_notifications_enabled', '0'),
  ('email_notification_time', '18:00'),
  ('last_scheduled_email_date', NULL),
  ('scheduled_email_time', '09:00')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- EMAIL NOTIFICATION USERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_notification_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_notification_users_user_id ON email_notification_users(user_id);

-- ============================================================================
-- EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  max_members INTEGER NOT NULL DEFAULT 10,
  image_url TEXT,
  creator_user_id TEXT NOT NULL,
  message_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_creator ON events(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_events_end_datetime ON events(end_datetime);

-- ============================================================================
-- EVENT MEMBERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_members (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_members_event ON event_members(event_id);
CREATE INDEX IF NOT EXISTS idx_event_members_user ON event_members(user_id);

-- ============================================================================
-- EVENT MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to_message_id BIGINT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_messages_event_id ON event_messages(event_id);
CREATE INDEX IF NOT EXISTS idx_event_messages_created_at ON event_messages(created_at);

-- ============================================================================
-- EVENT MESSAGE ATTACHMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_message_attachments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_message_id BIGINT NOT NULL,
  filename TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_message_attachments_event_message_id ON event_message_attachments(event_message_id);

-- ============================================================================
-- EVENT MESSAGE REACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_message_reactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_message_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_event_message_reactions_message ON event_message_reactions(event_message_id);

-- ============================================================================
-- EVENT MESSAGE READS
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_message_reads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_message_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_message_reads_event_message_id ON event_message_reads(event_message_id);
CREATE INDEX IF NOT EXISTS idx_event_message_reads_user_id ON event_message_reads(user_id);

-- ============================================================================
-- EVENT HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  max_members INTEGER NOT NULL,
  image_url TEXT,
  creator_user_id TEXT NOT NULL,
  creator_name TEXT,
  creator_room TEXT,
  total_attendees INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT false,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_history_attendees (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_history_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_history_id, user_id)
);

-- ============================================================================
-- TYPING STATUS
-- ============================================================================
CREATE TABLE IF NOT EXISTS typing_status (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_type TEXT NOT NULL,
  group_id TEXT NOT NULL, -- 'main' for the main chat (NULL would defeat the UNIQUE below)
  last_typed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, group_type, group_id)
);

CREATE INDEX IF NOT EXISTS idx_typing_status_group ON typing_status(group_type, group_id);
CREATE INDEX IF NOT EXISTS idx_typing_status_last_typed ON typing_status(last_typed_at);

-- ============================================================================
-- MARKET LISTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS market_listings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  transaction_type TEXT,
  is_free BOOLEAN DEFAULT true,
  price REAL,
  rental_start_datetime TIMESTAMPTZ,
  rental_end_datetime TIMESTAMPTZ,
  status TEXT DEFAULT 'open',
  is_deleted BOOLEAN DEFAULT false,
  is_completed BOOLEAN DEFAULT false,
  winner_user_id TEXT,
  creator_user_id TEXT NOT NULL,
  message_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_listings_creator ON market_listings(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);

CREATE TABLE IF NOT EXISTS market_listing_images (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id BIGINT NOT NULL,
  image_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_listing_images_listing ON market_listing_images(listing_id);

CREATE TABLE IF NOT EXISTS market_listing_interested (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_listing_interested_listing ON market_listing_interested(listing_id);

-- ============================================================================
-- LISTING MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS listing_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to_message_id BIGINT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_messages_listing_id ON listing_messages(listing_id);

CREATE TABLE IF NOT EXISTS listing_message_attachments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_message_id BIGINT NOT NULL,
  filename TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_message_attachments_message_id ON listing_message_attachments(listing_message_id);

CREATE TABLE IF NOT EXISTS listing_message_reactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_message_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_message_reactions_message_id ON listing_message_reactions(listing_message_id);

CREATE TABLE IF NOT EXISTS listing_message_reads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_message_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_message_reads_message_id ON listing_message_reads(listing_message_id);

-- ============================================================================
-- MARKET TRANSACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS market_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_title TEXT NOT NULL,
  listing_type TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  is_free BOOLEAN DEFAULT false,
  price REAL,
  image_url TEXT,
  creator_user_id TEXT NOT NULL,
  creator_name TEXT,
  creator_room TEXT,
  winner_user_id TEXT NOT NULL,
  winner_name TEXT,
  winner_room TEXT,
  rental_start_datetime TIMESTAMPTZ,
  rental_end_datetime TIMESTAMPTZ,
  closed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MARKET LISTING HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS market_listing_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  transaction_type TEXT,
  is_free BOOLEAN DEFAULT true,
  price REAL,
  image_url TEXT,
  creator_user_id TEXT NOT NULL,
  creator_name TEXT,
  creator_room TEXT,
  total_interested INTEGER DEFAULT 0,
  winner_user_id TEXT,
  winner_name TEXT,
  winner_room TEXT,
  helper_user_ids TEXT,
  helper_names TEXT,
  is_deleted BOOLEAN DEFAULT false,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_listing_history_interested (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_history_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_history_id, user_id)
);

-- ============================================================================
-- REMINDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS reminders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id BIGINT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_expires_at ON reminders(expires_at);
CREATE INDEX IF NOT EXISTS idx_reminders_message_id ON reminders(message_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_listing_interested ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by API routes with service role key)
-- All authenticated API routes use service role — so we grant service_role full access
-- and deny everything else by default.

CREATE POLICY "service_role_all" ON users TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON messages TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON reactions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON attachments TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON message_reads TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON notifications TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON events TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON event_members TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON event_messages TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON event_message_reactions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON event_message_reads TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON market_listings TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON market_listing_images TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON market_listing_interested TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON listing_messages TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON listing_message_reactions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON listing_message_reads TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON reminders TO service_role USING (true) WITH CHECK (true);
