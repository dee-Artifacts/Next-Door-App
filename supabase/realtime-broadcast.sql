-- Realtime Broadcast on private channels (Phase 3).
-- Run in the Supabase SQL editor, before or after deploying the client:
-- without it, private channels fail to join and the app keeps polling
-- (CHANNEL_ERROR -> polling fallback); without the client, broadcasts go
-- unheard. Safe to run more than once.
--
-- Topics (all private):
--   main            main chat: message changes, reads, typing, reminders
--   event:<id>      event chat: message changes, reads, typing, members
--   listing:<id>    listing chat: message changes, reads, typing, members
--   user:<user id>  one user: new notifications, account blocked/deleted
--
-- Payloads are small "something changed" signals. The client answers with
-- one incremental fetch (after/since cursor), so rendering logic stays on
-- the server and nothing private travels in the broadcast itself.
-- Triggers run as the writer (service_role), so realtime.send is not
-- subject to the policy below; clients have no INSERT policy and cannot
-- broadcast or forge events.

-- Stop here if this project has no realtime.send (Broadcast from Database)
do $$
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    raise exception 'realtime.send is not available in this project; nothing was changed';
  end if;
end $$;

create schema if not exists nextdoor_realtime;
revoke all on schema nextdoor_realtime from public;
grant usage on schema nextdoor_realtime to authenticated;

-- ── Who may join which topic ──────────────────────────────────────────────
-- SECURITY DEFINER because the app tables only allow service_role under RLS.
create or replace function nextdoor_realtime.can_join_topic(topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  text := (select auth.uid())::text;
  kind text := split_part(topic, ':', 1);
  ref  text := split_part(topic, ':', 2);
begin
  if uid is null then
    return false;
  end if;

  -- Blocked (is_active 0/false) or deleted accounts join nothing.
  -- ::text works whether is_active is an integer or a boolean column.
  if not exists (
    select 1 from public.users u
    where u.id = uid
      and coalesce(u.is_active::text, '1') not in ('0', 'false')
      and coalesce(u.is_deleted::text, 'false') not in ('true', '1')
  ) then
    return false;
  end if;

  if topic = 'main' then
    return true;
  end if;
  if kind = 'user' then
    return ref = uid;
  end if;
  if ref !~ '^[0-9]+$' then
    return false;
  end if;

  if kind = 'event' then
    -- Members only, and only until the event dissolves (24h after it ends)
    return exists (
      select 1
      from public.event_members m
      join public.events e on e.id = m.event_id
      where m.event_id = ref::bigint
        and m.user_id = uid
        and e.end_datetime > now() - interval '24 hours'
    );
  end if;

  if kind = 'listing' then
    -- Same rule as the API: the creator or someone marked interested
    return exists (
      select 1 from public.market_listings l
      where l.id = ref::bigint and l.creator_user_id = uid
    ) or exists (
      select 1 from public.market_listing_interested i
      where i.listing_id = ref::bigint and i.user_id = uid
    );
  end if;

  return false;
end;
$$;

revoke all on function nextdoor_realtime.can_join_topic(text) from public;
grant execute on function nextdoor_realtime.can_join_topic(text) to authenticated;

-- Receiving broadcasts on a private channel needs SELECT on realtime.messages.
-- No INSERT policy: clients cannot send.
drop policy if exists "chat members receive broadcasts" on realtime.messages;
create policy "chat members receive broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select nextdoor_realtime.can_join_topic((select realtime.topic())))
);

-- ── Sending: a Realtime failure must never fail the write that caused it ───
create or replace function nextdoor_realtime.send(payload jsonb, event text, topic text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(payload, event, topic, true);
exception when others then
  raise warning 'realtime broadcast to % failed: %', topic, sqlerrm;
end;
$$;

revoke all on function nextdoor_realtime.send(jsonb, text, text) from public;

-- ── Message inserts and updates (edits, deletes, reactions, pins, cards) ──
-- Reactions, pins and card changes already bump the message's updated_at
-- (src/lib/message-touch.ts), so one trigger per message table covers them.
create or replace function nextdoor_realtime.broadcast_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := to_jsonb(new);
  topic text;
begin
  topic := case tg_table_name
    when 'messages' then case when coalesce(r->>'group_id', 'main') = 'main' then 'main' end
    when 'event_messages' then 'event:' || (r->>'event_id')
    when 'listing_messages' then 'listing:' || (r->>'listing_id')
  end;
  if topic is not null then
    perform nextdoor_realtime.send(jsonb_build_object('id', r->'id'), 'changed', topic);
  end if;
  return null;
end;
$$;

drop trigger if exists broadcast_change on public.messages;
create trigger broadcast_change after insert or update on public.messages
  for each row execute function nextdoor_realtime.broadcast_message_change();
drop trigger if exists broadcast_change on public.event_messages;
create trigger broadcast_change after insert or update on public.event_messages
  for each row execute function nextdoor_realtime.broadcast_message_change();
drop trigger if exists broadcast_change on public.listing_messages;
create trigger broadcast_change after insert or update on public.listing_messages
  for each row execute function nextdoor_realtime.broadcast_message_change();

-- ── Read receipts: one signal per chat per statement (mark-read is batched).
-- The payload lists who read, so a reader's own tabs can ignore it.
create or replace function nextdoor_realtime.broadcast_reads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'message_reads' then
    perform nextdoor_realtime.send(jsonb_build_object('user_ids', c.user_ids), 'read', 'main')
    from (select jsonb_agg(distinct n.user_id) as user_ids from new_rows n) c
    where c.user_ids is not null;
  elsif tg_table_name = 'event_message_reads' then
    perform nextdoor_realtime.send(jsonb_build_object('user_ids', c.user_ids), 'read', 'event:' || c.event_id)
    from (
      select m.event_id, jsonb_agg(distinct n.user_id) as user_ids
      from new_rows n join public.event_messages m on m.id = n.event_message_id
      group by m.event_id
    ) c;
  elsif tg_table_name = 'listing_message_reads' then
    perform nextdoor_realtime.send(jsonb_build_object('user_ids', c.user_ids), 'read', 'listing:' || c.listing_id)
    from (
      select m.listing_id, jsonb_agg(distinct n.user_id) as user_ids
      from new_rows n join public.listing_messages m on m.id = n.listing_message_id
      group by m.listing_id
    ) c;
  end if;
  return null;
end;
$$;

drop trigger if exists broadcast_reads on public.message_reads;
create trigger broadcast_reads after insert on public.message_reads
  referencing new table as new_rows
  for each statement execute function nextdoor_realtime.broadcast_reads();
drop trigger if exists broadcast_reads on public.event_message_reads;
create trigger broadcast_reads after insert on public.event_message_reads
  referencing new table as new_rows
  for each statement execute function nextdoor_realtime.broadcast_reads();
drop trigger if exists broadcast_reads on public.listing_message_reads;
create trigger broadcast_reads after insert on public.listing_message_reads
  referencing new table as new_rows
  for each statement execute function nextdoor_realtime.broadcast_reads();

-- ── Typing (the client maps user_id to a name from its user list) ─────────
create or replace function nextdoor_realtime.broadcast_typing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  topic text;
begin
  topic := case new.group_type
    when 'main' then 'main'
    when 'event' then 'event:' || new.group_id
    when 'listing' then 'listing:' || new.group_id
  end;
  if topic is not null then
    perform nextdoor_realtime.send(jsonb_build_object('user_id', new.user_id), 'typing', topic);
  end if;
  return null;
end;
$$;

drop trigger if exists broadcast_typing on public.typing_status;
create trigger broadcast_typing after insert or update on public.typing_status
  for each row execute function nextdoor_realtime.broadcast_typing();

-- ── Members joining/leaving an event or listing chat ──────────────────────
create or replace function nextdoor_realtime.broadcast_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  topic text;
begin
  topic := case tg_table_name
    when 'event_members' then 'event:' || (r->>'event_id')
    when 'market_listing_interested' then 'listing:' || (r->>'listing_id')
  end;
  perform nextdoor_realtime.send('{}'::jsonb, 'members', topic);
  return null;
end;
$$;

drop trigger if exists broadcast_members on public.event_members;
create trigger broadcast_members after insert or delete on public.event_members
  for each row execute function nextdoor_realtime.broadcast_members();
drop trigger if exists broadcast_members on public.market_listing_interested;
create trigger broadcast_members after insert or delete on public.market_listing_interested
  for each row execute function nextdoor_realtime.broadcast_members();

-- ── Per-user: notifications (mentions/replies) and account status ─────────
create or replace function nextdoor_realtime.broadcast_user_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'notifications' then
    perform nextdoor_realtime.send('{}'::jsonb, 'notify', 'user:' || new.user_id);
  elsif tg_table_name = 'users' then
    perform nextdoor_realtime.send('{}'::jsonb, 'account', 'user:' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists broadcast_notify on public.notifications;
create trigger broadcast_notify after insert on public.notifications
  for each row execute function nextdoor_realtime.broadcast_user_signal();
drop trigger if exists broadcast_account on public.users;
create trigger broadcast_account after update of is_active, is_deleted on public.users
  for each row
  when (old.is_active is distinct from new.is_active or old.is_deleted is distinct from new.is_deleted)
  execute function nextdoor_realtime.broadcast_user_signal();

-- ── Admin reminders change the bell count for everyone ────────────────────
create or replace function nextdoor_realtime.broadcast_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform nextdoor_realtime.send('{}'::jsonb, 'counts', 'main');
  return null;
end;
$$;

drop trigger if exists broadcast_counts on public.reminders;
create trigger broadcast_counts after insert or update or delete on public.reminders
  for each statement execute function nextdoor_realtime.broadcast_counts();

-- To undo: drop the triggers above, then
--   drop policy "chat members receive broadcasts" on realtime.messages;
--   drop schema nextdoor_realtime cascade;
