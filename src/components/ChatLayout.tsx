import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/src/lib/auth-hook";
import { useRouter } from "next/navigation";
import MessageList from "@/src/components/MessageList";
import MessageInput from "@/src/components/MessageInput";
import UserList from "@/src/components/UserList";
import ChatHeader from "@/src/components/ChatHeader";
import AdminSettingsModal from "@/src/components/AdminSettingsModal";
import PinnedMessageBadge from "@/src/components/PinnedMessageBadge";
import PinnedMessagesModal from "@/src/components/PinnedMessagesModal";
import TypingIndicator from "@/src/components/TypingIndicator";

import { useMessages } from "@/src/hooks/useMessages";
import { useUsers } from "@/src/hooks/useUsers";
import { useChatSync } from "@/src/hooks/useChatSync";
import { useTypingStatus } from "@/src/hooks/useTypingStatus";
import { usePolling } from "@/src/hooks/usePolling";
import { READ_RECEIPT_DELAY_MS, readBySomeoneElse, useRealtime, useSignalRefresh } from "@/src/hooks/useRealtime";
import type { Signal } from "@/src/lib/realtime";
import { handleBlockedAccount, stopIfDenied } from "@/src/lib/session-guard";
import { useToast } from "@/src/context/ToastContext";
import NotificationPanel from "@/src/components/NotificationPanel";
import SearchPanel from "@/src/components/SearchPanel";
import ImagePreviewPanel from "@/src/components/ImagePreviewPanel";
import Onboarding from "@/src/components/Onboarding";
import CreatorModal from "@/src/components/CreatorModal";
import MessageInfoPanel from "@/src/components/MessageInfoPanel";
import type { Message } from "@/src/lib/types";

interface OptimisticMessage {
  tempId: string;
  user_id: string;
  user_name: string;
  avatar_url: string | null;
  room_number: string | null;
  content: string;
  created_at: string;
  status: 'sending' | 'failed';
  attachments?: Array<{
    filename: string;
    preview?: string;
    file?: File;
  }>;
  reply_to_message_id?: number | null;
  reply_to_content?: string | null;
  reply_to_user_id?: string | null;
  reply_to_user_name?: string | null;
  hashtag_id?: number | null;
  error?: string;
  sentMessageId?: number;
}

interface ReplyToMessage {
  id: number;
  user_name: string;
  content: string;
}

type ActivePanel = 'users' | 'admin' | 'profile' | 'notifications' | 'search' | 'imagePreview' | 'creator' | 'messageInfo' | null;

interface ChatLayoutProps {
  groupId?: string;
  eventName?: string;
  eventId?: number;
  onBackToMain?: () => void;
  onExitEvent?: () => void;
  onDeleteEvent?: () => void;
  onGoToEventChat?: (eventId: number, eventName: string) => void;
}

export default function ChatLayout({ groupId, eventName, eventId, onBackToMain, onExitEvent, onDeleteEvent, onGoToEventChat }: ChatLayoutProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEventCreator, setIsEventCreator] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<ReplyToMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string>("");
  const [previewImageAlt, setPreviewImageAlt] = useState<string>("");
  const [messageInfoId, setMessageInfoId] = useState<number | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  const { typingUsers, updateTypingUsers, addTypingUser, sendTypingStatus } = useTypingStatus({ groupType: "main" });
  const { messages: rawMessages, cursor: messageCursor, lastReadMessageId, isLoading, hasInitiallyLoaded, refetch } = useMessages(groupId || null, { onTypingUsers: updateTypingUsers });
  
  // Ensure messages is always an array to prevent .map() errors
  const messages = Array.isArray(rawMessages) ? rawMessages : [];

  // Remove optimistic messages that now exist in real messages
  useEffect(() => {
    setOptimisticMessages(prev => 
      prev.filter(opt => {
        // If we have a sentMessageId, check if that message exists in real messages
        if (opt.sentMessageId) {
          const exists = messages.some(m => 'id' in m && m.id === opt.sentMessageId);
          return !exists; // Remove if it exists in real messages
        }
        return true; // Keep if no sentMessageId yet
      })
    );
  }, [messages]);
  // Realtime: while the main chat's topic is live, signals replace the polls below
  // (messages, typing, counts, pinned); they resume whenever it is not.
  const isMainChat = groupId === "main" || !groupId;
  const mainSignalRef = useRef<(signal: Signal) => void>(() => {});
  const live = useRealtime(isMainChat ? "main" : null, (signal) => mainSignalRef.current(signal));

  // The user list changes rarely (online status flips at sign-in/out), so slower while live
  const { users, refetch: refetchUsers } = useUsers(live ? 5 * 60_000 : 30_000, { catchUpOnReturn: !live });
  // Header counts every 30s; while idle, one combined check (counts + message changes) every 5 min
  const { unreadCount, notificationCount, refetchCounts, refresh: refreshChat } = useChatSync({
    chat: isMainChat ? "main" : undefined,
    cursor: messageCursor,
    withCounts: true,
    live,
  });
  // One /api/sync (counts + message changes) per burst of signals
  const refreshOnSignal = useSignalRefresh(refreshChat, live);
  mainSignalRef.current = (signal) => {
    if (signal.event === "read") {
      // Someone else's read receipts: soon is enough (my own reads change nothing here)
      if (readBySomeoneElse(signal, user?.id)) refreshOnSignal(READ_RECEIPT_DELAY_MS);
      return;
    }
    if (signal.event !== "typing") {
      refreshOnSignal(); // changed, counts, resumed (back from a long-hidden tab)
      return;
    }
    const typingId = String(signal.payload.user_id ?? "");
    if (!typingId || typingId === user?.id) return;
    const typist = users.find((u) => u.id === typingId);
    if (typist) {
      addTypingUser({ user_id: typist.id, name: typist.name || "Someone", avatar_url: typist.avatar_url, room_number: typist.room_number });
    } else {
      refetchUsers(); // someone new: known by their next ping
    }
  };
  const { showToast } = useToast();

  useEffect(() => {
    // Check if current user is admin
    const checkAdmin = async () => {
      try {
        const response = await fetch("/api/profile", { credentials: 'include' });
        const data = await response.json();
        setIsAdmin(data.is_admin === true || data.is_admin === 1);
      } catch (error) {
        console.error("Failed to check admin status:", error);
      }
    };
    checkAdmin();
  }, []);

  // Check if current user is event creator
  useEffect(() => {
    if (eventId && user) {
      const checkEventCreator = async () => {
        try {
          const response = await fetch(`/api/events/${eventId}`, { credentials: 'include' });
          if (response.ok) {
            const event = await response.json();
            setIsEventCreator(event.creator_user_id === user.id);
          }
        } catch (error) {
          console.error("Failed to check event creator:", error);
        }
      };
      checkEventCreator();
    } else {
      setIsEventCreator(false);
    }
  }, [eventId, user]);

  // Fetch pinned messages
  const fetchPinnedMessages = async () => {
    try {
      const response = await fetch("/api/messages/pinned", { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setPinnedMessages(data);
      } else {
        return stopIfDenied(response);
      }
    } catch (error) {
      console.error("Failed to fetch pinned messages:", error);
    }
  };

  useEffect(() => {
    fetchPinnedMessages();
  }, []);

  // Poll for new messages (and who is typing) every 5 seconds, unless Realtime is live
  usePolling(refetch, live ? null : 5000, { fallback: true });

  // Pinned messages change rarely; they are also refetched after pin/unpin and sending,
  // and whenever the set of pinned messages in the chat changes (e.g. another admin pins)
  usePolling(fetchPinnedMessages, live ? null : 60_000, { fallback: true });
  const pinnedKey = messages.filter((m) => "is_pinned" in m && m.is_pinned).map((m) => m.id).join(",");
  const pinnedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasInitiallyLoaded) return;
    if (pinnedKeyRef.current !== null && pinnedKeyRef.current !== pinnedKey) fetchPinnedMessages();
    pinnedKeyRef.current = pinnedKey;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedKey, hasInitiallyLoaded]);

  // Send heartbeat every 60 seconds to update online status (online = seen in the last 2 min).
  // It also reports is_active: a blocked account is signed out and sent to /blocked.
  const sendHeartbeat = async () => {
    try {
      const res = await fetch("/api/users/heartbeat", { method: "POST", credentials: 'include' });
      if (!res.ok) return stopIfDenied(res);
      const data = await res.json();
      if ((data.is_active === 0 || data.is_active === false) && !data.is_deleted) {
        await handleBlockedAccount();
      }
    } catch (error) {
      console.error("Heartbeat error:", error);
    }
  };
  useEffect(() => {
    sendHeartbeat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  usePolling(sendHeartbeat, 60_000);

  // This user's own topic: new mentions/replies, and the account being blocked or deleted
  useRealtime(user ? `user:${user.id}` : null, (signal) => {
    if (signal.event === "notify") refetchCounts();
    else if (signal.event === "account") sendHeartbeat();
  });

  // Close reaction bar on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (activeMessageId !== null) {
        setActiveMessageId(null);
      }
    };

    // Listen to scroll events with capture phase to catch all scrolls
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [activeMessageId]);

  const handleReply = (message: Message) => {
    setReplyToMessage({
      id: message.id,
      user_name: message.user_name,
      content: message.content,
    });
  };

  const handleCancelReply = () => {
    setReplyToMessage(null);
  };

  const handleScrollToMessage = (messageId: number, checkVisibility: boolean = false) => {
    // Wait for element to be rendered in DOM before checking visibility
    const checkAndScroll = () => {
      const messageElement = document.getElementById(`message-${messageId}`);
      if (!messageElement) {
        // Element not yet rendered, try again
        requestAnimationFrame(checkAndScroll);
        return;
      }
      
      let shouldHighlight = true;
      
      if (checkVisibility) {
        // Check if message is visible in viewport BEFORE scrolling
        const rect = messageElement.getBoundingClientRect();
        const isVisible = (
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight
        );
        
        // If message is already visible, don't highlight
        if (isVisible) {
          shouldHighlight = false;
        }
      }
      
      // Always scroll to the message
      messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
      
      // Only highlight if message wasn't initially visible
      if (shouldHighlight) {
        setHighlightedMessageId(messageId);
        // Clear highlight after 2 seconds
        setTimeout(() => {
          setHighlightedMessageId(null);
        }, 2000);
      }
    };
    
    checkAndScroll();
  };

  const handleNotificationMessageClick = (messageId: number) => {
    setActivePanel(null);
    handleScrollToMessage(messageId);
    refetchCounts();
  };

  const handleUnreadMessagesClick = () => {
    refetchCounts();
    if (messages.length === 0) return;

    // Find first unread message: one after the last read, or first message from another user
    let targetId: number | undefined;

    if (lastReadMessageId) {
      const lastReadIndex = messages.findIndex(m => 'id' in m && m.id === lastReadMessageId);
      if (lastReadIndex >= 0 && lastReadIndex < messages.length - 1) {
        const next = messages[lastReadIndex + 1];
        if ('id' in next) targetId = next.id as number;
      }
    }

    // Fallback: scroll to the first message not from the current user
    if (!targetId) {
      const first = messages.find(m => 'user_id' in m);
      if (first && 'id' in first) targetId = first.id as number;
    }

    if (targetId) {
      // Small delay so the panel close animation doesn't interfere with scroll
      setTimeout(() => handleScrollToMessage(targetId!), 150);
    }
  };

  const handleUnpinMessage = async (messageId: number) => {
    try {
      const response = await fetch(`/api/messages/${messageId}/pin`, {
        method: "DELETE",
        credentials: 'include',
      });

      if (response.ok) {
        fetchPinnedMessages();
        refetch(); // Refresh messages to update pin status
      }
    } catch (error) {
      console.error("Failed to unpin message:", error);
    }
  };

  const handleImagePreview = (imageUrl: string, altText?: string) => {
    setPreviewImageUrl(imageUrl);
    setPreviewImageAlt(altText || "");
    setActivePanel('imagePreview');
  };

  const handleMessageInfo = (messageId: number) => {
    setMessageInfoId(messageId);
    setActivePanel('messageInfo');
  };

  const handleJoinEvent = async (eventId: number) => {
    try {
      const response = await fetch(`/api/events/${eventId}/join`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        showToast("Successfully joined event", "success");
        refetch();
      } else {
        const error = await response.json();
        showToast(error.error || "Failed to join event", "error");
      }
    } catch (error) {
      console.error("Error joining event:", error);
      showToast("Failed to join event", "error");
    }
  };

  const handleOptimisticMessage = async (
    content: string,
    attachments: Array<{ file: File; preview?: string }>,
    replyToMessageId?: number,
    hashtagId?: number
  ) => {
    if (!user) return;

    // Create optimistic message with temp ID
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    
    // Fetch user details to get name, avatar, and room number
    let userName = 'You';
    let avatarUrl: string | null = null;
    let roomNumber: string | null = null;
    
    try {
      const profileResponse = await fetch('/api/profile', { credentials: 'include' });
      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        userName = profile.name || 'You';
        avatarUrl = profile.avatar_url || null;
        roomNumber = profile.room_number || null;
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
    
    const optimisticMsg: OptimisticMessage = {
      tempId,
      user_id: user.id,
      user_name: userName,
      avatar_url: avatarUrl,
      room_number: roomNumber,
      content,
      created_at: new Date().toISOString(),
      status: 'sending',
      attachments: attachments.map(att => ({
        filename: att.file.name,
        preview: att.preview,
        file: att.file,
      })),
      reply_to_message_id: replyToMessageId,
      hashtag_id: hashtagId,
    };

    // Get reply data if replying
    if (replyToMessageId) {
      const replyMsg = messages.find(m => 'type' in m && m.type === 'message' && m.id === replyToMessageId);
      if (replyMsg && 'content' in replyMsg) {
        optimisticMsg.reply_to_content = replyMsg.content;
        optimisticMsg.reply_to_user_id = replyMsg.user_id;
        optimisticMsg.reply_to_user_name = replyMsg.user_name;
      }
    }

    // Add to optimistic messages
    setOptimisticMessages(prev => [...prev, optimisticMsg]);

    // Auto-scroll to the optimistic message
    setTimeout(() => {
      const element = document.getElementById(`message-${tempId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 50);

    // Upload in background
    try {
      let uploadedAttachments: Array<{
        filename: string;
        file_key: string;
        file_size: number;
        content_type: string;
      }> = [];

      // Upload attachments
      for (const attachment of attachments) {
        const formData = new FormData();
        formData.append('file', attachment.file);
        formData.append('type', 'message');
        const uploadResponse = await fetch('/api/files', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        if (!uploadResponse.ok) {
          showToast('Failed to upload file', 'error');
          throw new Error('Failed to upload file');
        }
        const uploadData = await uploadResponse.json();
        uploadedAttachments.push({
          filename: attachment.file.name,
          file_key: uploadData.file_key,
          file_size: attachment.file.size,
          content_type: attachment.file.type
        });
      }

      // Try sending with automatic retry on failure (helps with cold start issues)
      let response: Response | null = null;
      let lastError: string = 'Unknown error';
      
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetch("/api/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            credentials: 'include',
            body: JSON.stringify({
              content,
              reply_to_message_id: replyToMessageId,
              hashtag_id: hashtagId,
              attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
            })
          });
          
          if (response.ok) {
            break; // Success, exit retry loop
          }
          
          // Log the error for debugging
          const errorData = await response.json().catch(() => ({ error: `HTTP ${response?.status}` }));
          lastError = errorData.error || `HTTP ${response.status}`;
          console.error(`[Message Send] Attempt ${attempt + 1} failed:`, lastError, 'Status:', response.status);
          
          // If it's a client error (4xx), don't retry
          if (response.status >= 400 && response.status < 500) {
            break;
          }
          
          // Wait before retrying (exponential backoff)
          if (attempt < 1) {
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          }
        } catch (fetchError) {
          console.error(`[Message Send] Attempt ${attempt + 1} network error:`, fetchError);
          lastError = 'Network error';
          if (attempt < 1) {
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          }
        }
      }

      if (response?.ok) {
        // Mark as sent but keep visible until we see it in polled messages
        const sentMessage = await response.json();
        setOptimisticMessages(prev => prev.map(m => 
          m.tempId === tempId 
            ? { ...m, status: 'sending' as const, sentMessageId: sentMessage?.id }
            : m
        ));
        // Fetch updated messages
        await refetch();
        fetchPinnedMessages();
      } else {
        // Mark as failed with the last error
        setOptimisticMessages(prev => prev.map(m => 
          m.tempId === tempId 
            ? { ...m, status: 'failed' as const, error: lastError }
            : m
        ));
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      // Mark as failed
      setOptimisticMessages(prev => prev.map(m => 
        m.tempId === tempId 
          ? { ...m, status: 'failed' as const, error: 'Network error' }
          : m
      ));
    }
  };

  const handleRetryMessage = async (tempId: string) => {
    const msg = optimisticMessages.find(m => m.tempId === tempId);
    if (!msg) return;

    // Reset status to sending
    setOptimisticMessages(prev => prev.map(m => 
      m.tempId === tempId 
        ? { ...m, status: 'sending' as const, error: undefined }
        : m
    ));

    // Retry upload
    try {
      let uploadedAttachments: Array<{
        filename: string;
        file_key: string;
        file_size: number;
        content_type: string;
      }> = [];

      // Upload attachments
      if (msg.attachments) {
        for (const attachment of msg.attachments) {
          if (attachment.file) {
            const formData = new FormData();
            formData.append('file', attachment.file);
            formData.append('type', 'message');
            const uploadResponse = await fetch('/api/files', {
              method: 'POST',
              body: formData,
              credentials: 'include'
            });
            if (!uploadResponse.ok) {
              throw new Error('Failed to upload file');
            }
            const uploadData = await uploadResponse.json();
            uploadedAttachments.push({
              filename: attachment.filename,
              file_key: uploadData.file_key,
              file_size: attachment.file.size,
              content_type: attachment.file.type
            });
          }
        }
      }

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: 'include',
        body: JSON.stringify({
          content: msg.content,
          reply_to_message_id: msg.reply_to_message_id,
          hashtag_id: msg.hashtag_id,
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        })
      });

      if (response.ok) {
        // Mark as sent but keep visible until we see it in polled messages
        const sentMessage = await response.json();
        setOptimisticMessages(prev => prev.map(m => 
          m.tempId === tempId 
            ? { ...m, status: 'sending' as const, sentMessageId: sentMessage?.id }
            : m
        ));
        // Fetch updated messages
        await refetch();
        fetchPinnedMessages();
      } else {
        const error = await response.json();
        // Mark as failed again
        setOptimisticMessages(prev => prev.map(m => 
          m.tempId === tempId 
            ? { ...m, status: 'failed' as const, error: error.error || 'Failed to send' }
            : m
        ));
      }
    } catch (error) {
      console.error("Failed to retry message:", error);
      // Mark as failed
      setOptimisticMessages(prev => prev.map(m => 
        m.tempId === tempId 
          ? { ...m, status: 'failed' as const, error: 'Network error' }
          : m
      ));
    }
  };

  const handleDeleteOptimisticMessage = (tempId: string) => {
    setOptimisticMessages(prev => prev.filter(m => m.tempId !== tempId));
  };

  

  if (!user) return null;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-light-bg to-slate-100 dark:from-dark-ocean dark:to-dark-ocean lg:h-screen overflow-x-hidden w-full max-w-full" style={{ height: '100dvh' }}>
      <ChatHeader
        onToggleUserList={() => setActivePanel(activePanel === 'users' ? null : 'users')}
        onToggleAdminSettings={() => setActivePanel(activePanel === 'admin' ? null : 'admin')}
        onEditProfile={() => router.push(`/profile/${user!.id}`)}
        onToggleNotifications={() => setActivePanel(activePanel === 'notifications' ? null : 'notifications')}
        onToggleSearch={() => setActivePanel(activePanel === 'search' ? null : 'search')}
        onShowOnboarding={() => setShowOnboarding(true)}
        onShowCreator={() => setActivePanel(activePanel === 'creator' ? null : 'creator')}
        userCount={users.filter(u => u.is_active === 1).length}
        isAdmin={isAdmin}
        notificationCount={notificationCount}
        groupName={eventName}
        showBackButton={!!onBackToMain}
        onBack={onBackToMain}
        onExitEvent={onExitEvent}
        onDeleteEvent={onDeleteEvent}
        isEventCreator={isEventCreator}
      />
      
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {/* Pinned messages badge */}
          {pinnedMessages.length > 0 && (
            <div className="px-4 pt-3 pb-2 flex justify-center">
              <PinnedMessageBadge
                count={pinnedMessages.length}
                onClick={() => setShowPinnedMessages(true)}
              />
            </div>
          )}
          
          <MessageList 
            messages={messages}
            optimisticMessages={optimisticMessages}
            isLoading={isLoading}
            hasInitiallyLoaded={hasInitiallyLoaded}
            currentUserId={user.id}
            onMessageUpdated={refetch}
            onReply={handleReply}
            highlightedMessageId={highlightedMessageId}
            onScrollToMessage={handleScrollToMessage}
            activeMessageId={activeMessageId}
            onSetActiveMessage={setActiveMessageId}
            unreadCount={unreadCount}
            lastReadMessageId={lastReadMessageId}
            onUnreadBadgeDismissed={refetchCounts}
            onImagePreview={handleImagePreview}
            onJoinEvent={handleJoinEvent}
            onGoToEventChat={onGoToEventChat}
            onRetryMessage={handleRetryMessage}
            onDeleteOptimisticMessage={handleDeleteOptimisticMessage}
            isAdmin={isAdmin}
            onMessageInfo={handleMessageInfo}
          />
          <TypingIndicator typingUsers={typingUsers} />
          <MessageInput 
            onOptimisticMessage={handleOptimisticMessage}
            replyToMessage={replyToMessage}
            onCancelReply={handleCancelReply}
            groupId={groupId}
            onTyping={sendTypingStatus}
            users={users}
          />
        </div>
        
        {activePanel === 'users' && (
          <div className="hidden lg:block w-80 border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <UserList users={users} currentUserId={user.id} onClose={() => setActivePanel(null)} />
          </div>
        )}

        {activePanel === 'admin' && (
          <div className="hidden lg:block w-96 border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <AdminSettingsModal onClose={() => setActivePanel(null)} />
          </div>
        )}

        {activePanel === 'search' && (
          <div className="hidden lg:block w-96 border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <SearchPanel 
              onClose={() => setActivePanel(null)} 
              onMessageClick={handleScrollToMessage}
            />
          </div>
        )}

        {activePanel === 'imagePreview' && (
          <div className="hidden lg:block w-[600px] border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <ImagePreviewPanel 
              imageUrl={previewImageUrl}
              altText={previewImageAlt}
              onClose={() => setActivePanel(null)} 
            />
          </div>
        )}

        {activePanel === 'creator' && (
          <div className="hidden lg:block w-80 border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <CreatorModal onClose={() => setActivePanel(null)} />
          </div>
        )}

        {activePanel === 'messageInfo' && messageInfoId && (
          <div className="hidden lg:block w-80 border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <MessageInfoPanel messageId={messageInfoId} onClose={() => setActivePanel(null)} groupType="main" />
          </div>
        )}
      </div>
      
      {/* Mobile user list overlay */}
      {activePanel === 'users' && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => setActivePanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <UserList users={users} currentUserId={user.id} onClose={() => setActivePanel(null)} />
          </div>
        </div>
      )}

      {/* Mobile admin settings overlay */}
      {activePanel === 'admin' && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => setActivePanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-96 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <AdminSettingsModal onClose={() => setActivePanel(null)} />
          </div>
        </div>
      )}

      {/* Mobile search overlay */}
      {activePanel === 'search' && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => setActivePanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-96 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <SearchPanel 
              onClose={() => setActivePanel(null)} 
              onMessageClick={handleScrollToMessage}
            />
          </div>
        </div>
      )}

      {/* Mobile image preview overlay */}
      {activePanel === 'imagePreview' && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => setActivePanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-[600px] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <ImagePreviewPanel 
              imageUrl={previewImageUrl}
              altText={previewImageAlt}
              onClose={() => setActivePanel(null)} 
            />
          </div>
        </div>
      )}

      {/* Mobile creator overlay */}
      {activePanel === 'creator' && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => setActivePanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <CreatorModal onClose={() => setActivePanel(null)} />
          </div>
        </div>
      )}

      {/* Mobile message info overlay */}
      {activePanel === 'messageInfo' && messageInfoId && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => setActivePanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <MessageInfoPanel messageId={messageInfoId} onClose={() => setActivePanel(null)} groupType="main" />
          </div>
        </div>
      )}

      {/* Notification dropdown */}
      {activePanel === 'notifications' && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setActivePanel(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <NotificationPanel 
              onClose={() => setActivePanel(null)}
              onMessageClick={handleNotificationMessageClick}
              onUnreadClick={handleUnreadMessagesClick}
              unreadMessageCount={unreadCount}
              groupId={groupId}
            />
          </div>
        </div>
      )}

      {/* Pinned messages modal */}
      <PinnedMessagesModal
        isOpen={showPinnedMessages}
        onClose={() => setShowPinnedMessages(false)}
        messages={pinnedMessages}
        onUnpin={handleUnpinMessage}
        onScrollToMessage={handleScrollToMessage}
        isAdmin={isAdmin}
      />

      {/* Onboarding modal */}
      {showOnboarding && (
        <Onboarding isModal={true} onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
