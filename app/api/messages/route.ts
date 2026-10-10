import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error, sanitizeHtml } from '@/src/lib/api-helpers';
import { loadMainMessages } from '@/src/lib/chat-messages';
import { getTypingUsers } from '@/src/lib/typing';
import { isRateLimited, getClientIp } from '@/src/lib/rate-limit';

export async function GET(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 'messages:get', 120)) return error('Too many requests', 429);
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);

  const groupId = request.nextUrl.searchParams.get('group_id') || 'main';
  const db = getServiceClient();

  try {
    const [result, typingUsers] = await Promise.all([
      loadMainMessages(db, userId, groupId),
      getTypingUsers(db, userId, 'main', null),
    ]);
    // Return as object so useMessages can read last_read_message_id alongside the array
    return json({ ...result, typing_users: typingUsers });
  } catch (err) {
    console.error('[messages] GET failed:', err);
    return error('Failed to load messages', 500);
  }
}

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 'messages:post', 60)) return error('Too many requests', 429);
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);

  const db = getServiceClient();
  const { data: caller } = await db.from('users').select('is_active, name, room_number, is_admin').eq('id', userId).single();
  // is_active null = newly created row, treat as active. Only block when explicitly 0.
  if (!caller || caller.is_active === 0) return error('Your account has been deactivated', 403);

  const isAdmin = caller.is_admin === 1 || caller.is_admin === true;

  const body = await request.json().catch(() => ({}));
  const { content, group_id = 'main', reply_to_message_id, attachments, hashtag_id } = body;

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if ((!content || !content.trim()) && !hasAttachments) return error('Content or attachment is required', 400);
  if (content && content.length > 2000) return error('Message too long', 400);

  const sanitized = content ? sanitizeHtml(content) : '';

  // Detect admin commands
  const hasPinCommand = isAdmin && /#pin\b/i.test(sanitized);
  const announcementMatch = isAdmin && sanitized.match(/@announcement(\d*)/i);
  const announcementHours = announcementMatch ? (parseInt(announcementMatch[1] || '24') || 24) : null;

  // Build message fields
  const msgFields: Record<string, unknown> = {
    user_id: userId,
    content: sanitized,
    group_id,
    reply_to_message_id: reply_to_message_id || null,
    hashtag_id: hashtag_id || null,
  };

  if (hasPinCommand) {
    msgFields.is_pinned = true;
  }

  if (announcementMatch && announcementHours) {
    msgFields.is_active_announcement = true;
    msgFields.announcement_expires_at = new Date(Date.now() + announcementHours * 60 * 60 * 1000).toISOString();
  }

  const { data: msg, error: insertErr } = await db.from('messages').insert(msgFields).select().single();

  if (insertErr) return error('Failed to create message', 500);

  if (attachments?.length) {
    await db.from('attachments').insert(
      attachments.map((a: Record<string, unknown>) => ({ ...a, message_id: msg.id }))
    );
  }

  // Create reminder entry for announcements
  if (announcementMatch && announcementHours && msg.id) {
    await db.from('reminders').insert({
      message_id: msg.id,
      created_by_user_id: userId,
      expires_at: msgFields.announcement_expires_at,
    });
  }

  // Parse @mentions and create notifications (skip @announcement command itself)
  const mentionMatches = sanitized.match(/@([^@\s,]+)/g) || [];
  const mentions = mentionMatches.filter((m) => !/^@announcement/i.test(m));
  if (mentions.length > 0) {
    const { data: allUsers } = await db.from('users').select('id, name').eq('is_active', 1).eq('is_deleted', false);
    for (const mention of mentions) {
      const mentionName = mention.slice(1).toLowerCase();
      const mentioned = (allUsers || []).find((u: { name: string }) => u.name?.toLowerCase() === mentionName);
      if (mentioned && (mentioned as { id: string }).id !== userId) {
        await db.from('notifications').insert({
          user_id: (mentioned as { id: string }).id,
          type: 'mention',
          message_id: msg.id,
          mentioned_by_user_id: userId,
        });
      }
    }
  }

  // Notify the original message author when someone replies to their message
  if (reply_to_message_id) {
    const { data: originalMsg } = await db.from('messages').select('user_id').eq('id', reply_to_message_id).single();
    if (originalMsg && originalMsg.user_id !== userId) {
      await db.from('notifications').insert({
        user_id: originalMsg.user_id,
        type: 'reply',
        message_id: msg.id,
        mentioned_by_user_id: userId,
      });
    }
  }

  return json(msg, 201);
}
