import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import MessageBubble from "@/src/components/MessageBubble";
import DateSeparator from "@/src/components/DateSeparator";
import WelcomeMessage from "@/src/components/WelcomeMessage";
import UserRemovedMessage from "@/src/components/UserRemovedMessage";
import ReactivatedMessage from "@/src/components/ReactivatedMessage";
import EmptyState from "@/src/components/EmptyState";
import { MessageListSkeleton } from "@/src/components/Skeletons";
import type { Message, SystemMessage } from "@/src/lib/types";

type MessageOrSystem = Message | SystemMessage;

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
}

interface MessageListProps {
  messages: MessageOrSystem[];
  optimisticMessages: OptimisticMessage[];
  isLoading: boolean;
  hasInitiallyLoaded: boolean;
  currentUserId: string;
  onMessageUpdated: () => void;
  onReply: (message: Message) => void;
  highlightedMessageId: number | null;
  onScrollToMessage: (messageId: number) => void;
  activeMessageId: number | null;
  onSetActiveMessage: (messageId: number | null) => void;
  unreadCount: number;
  lastReadMessageId: number | null;
  onUnreadBadgeDismissed?: () => void;
  onImagePreview: (imageUrl: string, altText?: string) => void;
  onJoinEvent?: (eventId: number) => void;
  onGoToEventChat?: (eventId: number, eventName: string) => void;
  onRetryMessage: (tempId: string) => void;
  onDeleteOptimisticMessage: (tempId: string) => void;
  isAdmin?: boolean;
  onMessageInfo?: (messageId: number) => void;
}

export default function MessageList({ 
  messages, 
  optimisticMessages,
  isLoading,
  hasInitiallyLoaded,
  currentUserId, 
  onMessageUpdated, 
  onReply, 
  highlightedMessageId, 
  onScrollToMessage, 
  activeMessageId, 
  onSetActiveMessage, 
  unreadCount, 
  lastReadMessageId, 
  onUnreadBadgeDismissed, 
  onImagePreview,
  onJoinEvent,
  onGoToEventChat,
  onRetryMessage,
  onDeleteOptimisticMessage,
  isAdmin = false,
  onMessageInfo
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [visibleMessages, setVisibleMessages] = useState<Set<number>>(new Set());
  
  // Badge state management - keep stable across re-renders
  const [showUnreadBadge, setShowUnreadBadge] = useState(false);
  const initialFirstUnreadMessageId = useRef<number | null>(null);
  const initialUnreadCount = useRef<number>(0);
  const initialMessageCount = useRef<number>(0);
  const badgeInitialized = useRef(false);
  const hasScrolledToUnread = useRef(false);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);

  // CRITICAL: Ensure messages is ALWAYS an array before any operations
  // This prevents "TypeError: messages.map is not a function" errors
  const safeMessages = Array.isArray(messages) ? messages : [];
  
  // Combine real messages with optimistic messages
  type CombinedMessage = MessageOrSystem | (OptimisticMessage & { isOptimistic: true });
  
  const allMessages: CombinedMessage[] = [
    ...safeMessages,
    ...optimisticMessages.map(msg => ({ ...msg, isOptimistic: true as const, type: 'message' as const }))
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  
  // Filter only regular messages for read tracking
  const regularMessages = safeMessages.filter((msg): msg is Message => 'type' in msg && msg.type === 'message');

  // Find the last message with reads (for showing read receipts)
  const lastOwnReadMessageId = regularMessages
    .slice()
    .reverse()
    .find((msg) => msg.user_id === currentUserId && msg.reads && msg.reads.length > 0)?.id || null;

  // Calculate the current first unread message (changes with polling)
  const currentFirstUnreadMessageId = lastReadMessageId 
    ? regularMessages.find((msg) => msg.id > lastReadMessageId && msg.user_id !== currentUserId)?.id || null
    : regularMessages.find((msg) => msg.user_id !== currentUserId)?.id || null;

  // Check if we need to show a date separator
  const shouldShowDateSeparator = (currentMessage: MessageOrSystem, prevMessage: MessageOrSystem | null) => {
    if (!prevMessage) return true;
    
    const currentDate = new Date(currentMessage.created_at);
    const prevDate = new Date(prevMessage.created_at);
    
    // Compare dates ignoring time
    currentDate.setHours(0, 0, 0, 0);
    prevDate.setHours(0, 0, 0, 0);
    
    return currentDate.getTime() !== prevDate.getTime();
  };

  // Initialize badge state once on mount
  useEffect(() => {
    if (!badgeInitialized.current && currentFirstUnreadMessageId && !isLoading) {
      const dismissedBadgeId = sessionStorage.getItem('dismissedUnreadBadge');
      
      // Set the initial first unread message ID and count
      initialFirstUnreadMessageId.current = currentFirstUnreadMessageId;
      initialUnreadCount.current = unreadCount;
      initialMessageCount.current = safeMessages.length;
      
      // Check if this specific message was already dismissed
      if (dismissedBadgeId && parseInt(dismissedBadgeId) === currentFirstUnreadMessageId) {
        setShowUnreadBadge(false);
      } else {
        setShowUnreadBadge(true);
      }
      
      badgeInitialized.current = true;
    }
  }, [currentFirstUnreadMessageId, isLoading, unreadCount, messages.length]);

  // Check if new messages arrived (live messages) - if so, hide badge
  useEffect(() => {
    if (badgeInitialized.current && showUnreadBadge && safeMessages.length > initialMessageCount.current) {
      // New messages arrived - hide the badge
      setShowUnreadBadge(false);
      if (initialFirstUnreadMessageId.current) {
        sessionStorage.setItem('dismissedUnreadBadge', initialFirstUnreadMessageId.current.toString());
      }
    }
  }, [safeMessages.length, showUnreadBadge]);

  const scrollToBottom = (smooth = true) => {
    // Delay slightly so the DOM has finished rendering new messages before scrolling
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
      }
    }, 100);
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    // Show button if user is more than 100px from bottom
    setShowScrollButton(distanceFromBottom > 100);
    
    // Enable auto-scroll if user is near bottom (within 50px)
    setShouldAutoScroll(distanceFromBottom < 50);
  };

  useEffect(() => {
    // Only auto-scroll on new messages if user is already near bottom and no unread messages to show
    if (shouldAutoScroll && !initialFirstUnreadMessageId.current) {
      scrollToBottom(false);
    }
  }, [allMessages, shouldAutoScroll]);

  // Initial scroll on mount - only if no unread messages
  useEffect(() => {
    if (!initialFirstUnreadMessageId.current && !isLoading) {
      scrollToBottom(false);
    }
  }, [isLoading]);

  // Set up Intersection Observer to track visible messages
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const messageId = parseInt(entry.target.getAttribute('data-message-id') || '0');
          if (!messageId) return;

          if (entry.isIntersecting) {
            // Message became visible
            setVisibleMessages((prev) => new Set(prev).add(messageId));
          } else {
            // Message left viewport
            setVisibleMessages((prev) => {
              const newSet = new Set(prev);
              newSet.delete(messageId);
              return newSet;
            });
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.5, // Message is considered visible when 50% is in viewport
      }
    );

    // Observe all message elements
    messageRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [safeMessages]);

  // Mark messages from others as read once they've been on screen for 1.5s.
  // Each id is sent at most once, newly visible ids are batched into one request,
  // and messages the server already lists as read by us are never re-sent, so
  // polling refreshes don't trigger new requests. The server keeps
  // last_read_message_id at the highest id it has seen.
  const sentReadIdsRef = useRef<Set<number>>(new Set());
  const pendingReadIdsRef = useRef<Set<number>>(new Set());
  const readFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleMessagesRef = useRef(visibleMessages);
  visibleMessagesRef.current = visibleMessages;
  const badgeStateRef = useRef({ showUnreadBadge, onUnreadBadgeDismissed });
  badgeStateRef.current = { showUnreadBadge, onUnreadBadgeDismissed };

  useEffect(() => {
    visibleMessages.forEach((messageId) => {
      if (sentReadIdsRef.current.has(messageId) || pendingReadIdsRef.current.has(messageId)) return;
      const message = regularMessages.find((m) => m.id === messageId);
      // Only mark as read if it's not our own message
      if (!message || message.user_id === currentUserId) return;
      if (message.reads?.some((r) => r.user_id === currentUserId)) {
        sentReadIdsRef.current.add(messageId);
      }
      pendingReadIdsRef.current.add(messageId);
    });

    if (pendingReadIdsRef.current.size === 0 || readFlushTimerRef.current) return;

    readFlushTimerRef.current = setTimeout(() => {
      readFlushTimerRef.current = null;
      // Only messages still on screen after 1.5s count as read
      const seen = Array.from(pendingReadIdsRef.current).filter((id) => visibleMessagesRef.current.has(id));
      pendingReadIdsRef.current.clear();

      const toSend = seen.filter((id) => !sentReadIdsRef.current.has(id));
      if (toSend.length > 0) {
        toSend.forEach((id) => sentReadIdsRef.current.add(id));
        fetch('/api/messages/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message_ids: toSend }),
        }).catch(() => {});
      }

      const { showUnreadBadge: badgeShown, onUnreadBadgeDismissed: onDismissed } = badgeStateRef.current;
      const firstUnreadId = initialFirstUnreadMessageId.current;
      if (badgeShown && firstUnreadId && seen.includes(firstUnreadId)) {
        setShowUnreadBadge(false);
        sessionStorage.setItem('dismissedUnreadBadge', firstUnreadId.toString());
        if (onDismissed) onDismissed();
      }
    }, 1500);
  }, [visibleMessages, regularMessages, currentUserId]);

  useEffect(() => {
    return () => {
      if (readFlushTimerRef.current) clearTimeout(readFlushTimerRef.current);
    };
  }, []);

  // Scroll to highlighted message
  useEffect(() => {
    if (highlightedMessageId && messageRefs.current.has(highlightedMessageId)) {
      const element = messageRefs.current.get(highlightedMessageId);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedMessageId]);

  // Scroll to first unread message on initial load
  useEffect(() => {
    if (!hasScrolledToUnread.current && initialFirstUnreadMessageId.current && messageRefs.current.has(initialFirstUnreadMessageId.current) && !isLoading) {
      const element = messageRefs.current.get(initialFirstUnreadMessageId.current);
      if (element) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
        hasScrolledToUnread.current = true;
        setShouldAutoScroll(false); // Disable auto-scroll after positioning
      }
    }
  }, [initialFirstUnreadMessageId.current, isLoading, safeMessages]);

  // Set up Intersection Observer for first unread message to dismiss badge
  useEffect(() => {
    if (!initialFirstUnreadMessageId.current || !showUnreadBadge) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            // First unread message has scrolled out of view
            const rect = entry.boundingClientRect;
            const containerRect = containerRef.current?.getBoundingClientRect();
            
            if (containerRect && rect.bottom < containerRect.top) {
              // Message has scrolled above the viewport - dismiss badge permanently
              setShowUnreadBadge(false);
              if (initialFirstUnreadMessageId.current) {
                sessionStorage.setItem('dismissedUnreadBadge', initialFirstUnreadMessageId.current.toString());
              }
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0,
      }
    );

    if (firstUnreadRef.current) {
      observer.observe(firstUnreadRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [showUnreadBadge]);

  // Only show loading state on initial load, not during polling
  if (isLoading && !hasInitiallyLoaded) {
    return <MessageListSkeleton count={8} />;
  }

  // Only show empty state after initial load completes with no messages
  // During polling errors, we keep showing existing messages
  if (hasInitiallyLoaded && allMessages.length === 0) {
    return (
      <EmptyState
        type="chat"
        title="No messages yet"
        description="Be the first to start the conversation! Share updates, ask questions, or just say hello to your neighbors."
      />
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-4"
      >
        {allMessages.map((message, index) => {
          // Check if this is an optimistic message
          const isOptimistic = 'isOptimistic' in message && message.isOptimistic;
          const optimisticMsg = isOptimistic ? (message as OptimisticMessage & { isOptimistic: true }) : null;
          const regularMsg = !isOptimistic ? message : null;
          const prevMessage = index > 0 ? allMessages[index - 1] : null;
          // Optimistic message rendering
          if (isOptimistic && optimisticMsg) {
            return (
              <div key={optimisticMsg.tempId} id={`message-${optimisticMsg.tempId}`}>
                <MessageBubble
                  message={{
                    id: 0,
                    user_id: optimisticMsg.user_id,
                    user_name: optimisticMsg.user_name,
                    user_avatar_url: optimisticMsg.avatar_url,
                    user_room_number: optimisticMsg.room_number,
                    content: optimisticMsg.content,
                    created_at: optimisticMsg.created_at,
                    updated_at: optimisticMsg.created_at,
                    type: 'message',
                    attachments: optimisticMsg.attachments?.map((att, idx) => ({
                      id: idx,
                      message_id: 0,
                      filename: att.filename,
                      file_key: att.preview || '',
                      file_size: 0,
                      content_type: att.file?.type || 'image/*',
                      created_at: optimisticMsg.created_at,
                      updated_at: optimisticMsg.created_at,
                    })),
                    reply_to_message_id: optimisticMsg.reply_to_message_id,
                    reply_to_content: optimisticMsg.reply_to_content,
                    reply_to_user_id: optimisticMsg.reply_to_user_id,
                    reply_to_user_name: optimisticMsg.reply_to_user_name,
                  }}
                  isOwnMessage={true}
                  onMessageUpdated={onMessageUpdated}
                  onReply={() => {}}
                  onScrollToMessage={() => {}}
                  isActive={false}
                  onSetActive={() => {}}
                  isLastReadMessage={false}
                  onImagePreview={onImagePreview}
                  optimisticStatus={optimisticMsg.status}
                  onRetry={() => onRetryMessage(optimisticMsg.tempId)}
                  onDelete={() => onDeleteOptimisticMessage(optimisticMsg.tempId)}
                  isAdmin={isAdmin}
                />
              </div>
            );
          }

          // Regular message rendering
          if (!regularMsg) return null;

          const isSystemMessage = 'type' in regularMsg && regularMsg.type === 'system';
          const msgKey = 'type' in regularMsg ? `${regularMsg.type}-${regularMsg.id}` : `message-${Date.now()}`;
          const msgCreatedAt = regularMsg.created_at;
          const msgId = 'id' in regularMsg ? regularMsg.id : 0;
          const showDateSep = !isSystemMessage && regularMsg ? shouldShowDateSeparator(regularMsg as Message, prevMessage as MessageOrSystem | null) : false;
          
          return (
            <div key={msgKey}>
              {/* Show date separator if needed */}
              {showDateSep && <DateSeparator date={msgCreatedAt} />}
              
              {/* Show unread notification before the initial first unread message */}
              {!isSystemMessage && showUnreadBadge && initialUnreadCount.current > 0 && msgId === initialFirstUnreadMessageId.current && (
                <div className="flex justify-center mb-4">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-full shadow-lg font-medium text-sm">
                    {initialUnreadCount.current} unread message{initialUnreadCount.current > 1 ? 's' : ''}
                  </div>
                </div>
              )}
              
              {isSystemMessage ? (
                // Render system message based on type
                (() => {
                  try {
                    const sysMsg = regularMsg as SystemMessage;
                    const metadata = sysMsg.metadata ? JSON.parse(sysMsg.metadata) : {};
                    const messageType = metadata.message_type || 'user_joined';
                    
                    if (messageType === 'user_deleted' || messageType === 'user_deactivated') {
                      return (
                        <UserRemovedMessage
                          name={metadata.name || 'User'}
                          roomNumber={metadata.room_number || '?'}
                          avatarUrl={metadata.avatar_url || null}
                          userId={sysMsg.user_id}
                          isDeleted={messageType === 'user_deleted'}
                        />
                      );
                    }
                    
                    if (messageType === 'user_reactivated') {
                      return (
                        <ReactivatedMessage
                          name={metadata.name || 'User'}
                          roomNumber={metadata.room_number || '?'}
                          avatarUrl={metadata.avatar_url || null}
                          userId={sysMsg.user_id}
                        />
                      );
                    }
                    
                    // Default: welcome message for user_joined
                    return (
                      <WelcomeMessage
                        name={metadata.name || 'User'}
                        roomNumber={metadata.room_number || '?'}
                        avatarUrl={metadata.avatar_url || null}
                        userId={sysMsg.user_id}
                      />
                    );
                  } catch (e) {
                    return null;
                  }
                })()
              ) : (
                // Render regular message
                (() => {
                  // Type assertion for regular message
                  const msg = regularMsg as Message;
                  return (
                    <div
                      id={`message-${msg.id}`}
                      data-message-id={msg.id}
                      ref={(el) => {
                        if (el) {
                          messageRefs.current.set(msg.id, el);
                          // Also set firstUnreadRef if this is the initial first unread message
                          if (msg.id === initialFirstUnreadMessageId.current) {
                            firstUnreadRef.current = el;
                          }
                        } else {
                          messageRefs.current.delete(msg.id);
                          if (msg.id === initialFirstUnreadMessageId.current) {
                            firstUnreadRef.current = null;
                          }
                        }
                      }}
                      className={`transition-all duration-300 rounded-2xl ${
                        highlightedMessageId === msg.id 
                          ? 'bg-gradient-to-r from-emerald-100/50 via-teal-100/50 to-emerald-100/50 p-2 -m-2' 
                          : ''
                      }`}
                    >
                      <MessageBubble
                        message={msg}
                        isOwnMessage={msg.user_id === currentUserId}
                        onMessageUpdated={onMessageUpdated}
                        onReply={onReply}
                        onScrollToMessage={onScrollToMessage}
                        isActive={activeMessageId === msg.id}
                        onSetActive={(isActive) => onSetActiveMessage(isActive ? msg.id : null)}
                        isLastReadMessage={msg.id === lastOwnReadMessageId}
                        onImagePreview={onImagePreview}
                        onJoinEvent={onJoinEvent}
                        onGoToEventChat={onGoToEventChat}
                        isAdmin={isAdmin}
                        onMessageInfo={onMessageInfo}
                        hideTimestamp={(() => {
                          const nextMsg = allMessages[index + 1];
                          if (!nextMsg || 'isOptimistic' in nextMsg) return false;
                          const next = nextMsg as Message;
                          if (next.user_id !== msg.user_id) return false;
                          return new Date(next.created_at).getTime() - new Date(msg.created_at).getTime() < 60000;
                        })()}
                      />
                    </div>
                  );
                })()
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {showScrollButton && (
        <button
          onClick={() => {
            scrollToBottom(true);
            setShouldAutoScroll(true);
          }}
          className="absolute left-1/2 -translate-x-1/2 p-3 bg-white hover:bg-slate-50 rounded-full shadow-lg border-2 border-slate-200 transition-all hover:scale-110 z-10"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
          }}
          title="Scroll to bottom"
        >
          <ChevronDown className="w-5 h-5 text-slate-600" />
        </button>
      )}
    </div>
  );
}
