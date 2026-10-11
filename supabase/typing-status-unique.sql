-- typing_status: one row per (user, chat) instead of one per typing ping.
--
-- The main chat used group_id NULL, and NULLs never match in a unique index,
-- so every ping's upsert inserted a new row. The app now stores 'main'.
-- Run this AFTER deploying that change (older code would still write NULL).
-- Safe to run more than once.

-- 1. Typing rows only matter for a few seconds: start clean (drops the NULL
--    rows and any duplicates).
DELETE FROM typing_status;

-- 2. The unique index the upsert's onConflict (user_id, group_type, group_id)
--    needs, unless an equivalent one already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    WHERE t.relname = 'typing_status'
      AND i.indisunique
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM pg_attribute a
        WHERE a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
      ) = ARRAY['group_id', 'group_type', 'user_id']
  ) THEN
    CREATE UNIQUE INDEX typing_status_user_group_key
      ON typing_status (user_id, group_type, group_id);
  END IF;
END $$;

-- 3. No more NULL group_id.
ALTER TABLE typing_status ALTER COLUMN group_id SET NOT NULL;

-- Check: should list a unique index on (user_id, group_type, group_id)
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'typing_status';
