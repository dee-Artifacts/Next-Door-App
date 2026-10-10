import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import EventMessageBubble from "@/src/components/EventMessageBubble";
import DateSeparator from "@/src/components/DateSeparator";
import EmptyState from "@/src/components/EmptyState";
import { getUserAvatar } from "@/src/utils/avatars";

interface EventMessageAttachment {
  id: number;
  event_message_id: number;
  filename: string;
  file_key: string;
  file_size: number;
  content_type: string;
  created_at: string;
  updated_at: string;
}

interface EventMessageReaction {
  id: number;
  event_message_id: number;
  user_id: string;
  user_name: string;
  emoji: string;
  created_at: string;
}

interface EventMessageRead {
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
}

interface EventMessage {
  id: number;
  event_id: number;
  user_id: string;
  user_name: string;
  avatar_url: string | null;
  room_number: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  is_join_message?: boolean;
  is_creator_join?: boolean;
  is_leave_message?: boolean;
  is_event_details?: boolean;
  event_details?: {
    name: string;
    description: string | null;
    start_datetime: string;
    end_datetime: string;
    max_members: number;
    image_url: string | null;
  };
  attachments?: EventMessageAttachment[];
  reactions?: EventMessageReaction[];
  reads?: EventMessageRead[];
  reply_to_message_id?: number | null;
  reply_to_content?: string | null;
  reply_to_user_id?: string | null;
  reply_to_user_name?: string | null;
}

interface OptimisticMessage {
  tempId: string;
  event_id: number;
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
  error?: string;
}

interface EventMessageListProps {
  messages: EventMessage[];
  optimisticMessages: OptimisticMessage[];
  currentUserId: string;
  isLoading: boolean;
  onImagePreview: (imageUrl: string, altText?: string) => void;
  onReply: (message: any) => void;
  onMessageUpdated: () => void;
  eventId: number;
  highlightedMessageId?: number | null;
  onScrollToMessage?: (messageId: number) => void;
  onRetryMessage: (tempId: string) => void;
  onDeleteOptimisticMessage: (tempId: string) => void;
  onMessageInfo?: (messageId: number) => void;
}

export default function EventMessageList({
  messages,
  optimisticMessages,
  currentUserId,
  isLoading,
  onImagePreview,
  onReply,
  onMessageUpdated,
  eventId,
  highlightedMessageId: externalHighlightedMessageId,
  onScrollToMessage: externalOnScrollToMessage,
  onRetryMessage,
  onDeleteOptimisticMessage,
  onMessageInfo,
}: EventMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [internalHighlightedMessageId, setInternalHighlightedMessageId] = useState<number | null>(null);
  const [visibleMessages, setVisibleMessages] = useState<Set<number>>(new Set());
  
  // Use external highlighted message ID if provided, otherwise use internal
  const highlightedMessageId = externalHighlightedMessageId ?? internalHighlightedMessageId;
  const [lastReadMessageId, setLastReadMessageId] = useState<number | null>(null);
  
  // Badge state management
  const [showUnreadBadge, setShowUnreadBadge] = useState(false);
  const initialFirstUnreadMessageId = useRef<number | null>(null);
  const initialUnreadCount = useRef<number>(0);
  const initialMessageCount = useRef<number>(0);
  const badgeInitialized = useRef(false);
  const hasScrolledToUnread = useRef(false);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);

  // Combine real messages with optimistic messages
  type CombinedMessage = EventMessage | (OptimisticMessage & { isOptimistic: true });
  
  const allMessages: CombinedMessage[] = [
    ...messages,
    ...optimisticMessages.map(msg => ({ ...msg, isOptimistic: true as const }))
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Filter only regular messages (not join messages or event details)
  const regularMessages = messages.filter(
    (msg) => !msg.is_join_message && !msg.is_event_details
  );

  // Calculate the current first unread message
  const currentFirstUnreadMessageId = lastReadMessageId 
    ? regularMessages.find((msg) => msg.id > lastReadMessageId && msg.user_id !== currentUserId)?.id || null
    : regularMessages.find((msg) => msg.user_id !== currentUserId)?.id || null;

  // Calculate unread count
  const unreadCount = lastReadMessageId
    ? regularMessages.filter((msg) => msg.id > lastReadMessageId && msg.user_id !== currentUserId).length
    : regularMessages.filter((msg) => msg.user_id !== currentUserId).length;

  // Check if we need to show a date separator
  const shouldShowDateSeparator = (
    currentMessage: EventMessage,
    prevMessage: EventMessage | null
  ) => {
    if (!prevMessage) return true;

    const currentDate = new Date(currentMessage.created_at);
    const prevDate = new Date(prevMessage.created_at);

    // Compare dates ignoring time
    currentDate.setHours(0, 0, 0, 0);
    prevDate.setHours(0, 0, 0, 0);

    return currentDate.getTime() !== prevDate.getTime();
  };

  // Fetch last read message on mount
  useEffect(() => {
    const fetchLastRead = async () => {
      try {
        const response = await fetch(`/api/events/${eventId}/messages/last-read`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setLastReadMessageId(data.last_read_message_id || null);
        }
      } catch (error) {
        console.error('Error fetching last read message:', error);
      }
    };
    fetchLastRead();
  }, [eventId]);

  // Initialize badge state once on mount
  useEffect(() => {
    if (!badgeInitialized.current && currentFirstUnreadMessageId && !isLoading && lastReadMessageId !== null) {
      const dismissedBadgeId = sessionStorage.getItem(`dismissedEventUnreadBadge_${eventId}`);
      
      initialFirstUnreadMessageId.current = currentFirstUnreadMessageId;
      initialUnreadCount.current = unreadCount;
      initialMessageCount.current = messages.length;
      
      if (dismissedBadgeId && parseInt(dismissedBadgeId) === currentFirstUnreadMessageId) {
        setShowUnreadBadge(false);
      } else {
        setShowUnreadBadge(true);
      }
      
      badgeInitialized.current = true;
    }
  }, [currentFirstUnreadMessageId, isLoading, unreadCount, messages.length, lastReadMessageId, eventId]);

  // Check if new messages arrived - if so, hide badge
  useEffect(() => {
    if (badgeInitialized.current && showUnreadBadge && messages.length > initialMessageCount.current) {
      setShowUnreadBadge(false);
      if (initialFirstUnreadMessageId.current) {
        sessionStorage.setItem(`dismissedEventUnreadBadge_${eventId}`, initialFirstUnreadMessageId.current.toString());
      }
    }
  }, [messages.length, showUnreadBadge, eventId]);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
    });
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
    // Only auto-scroll on new messages if user is already near bottom and no unread messages
    if (shouldAutoScroll && !initialFirstUnreadMessageId.current) {
      scrollToBottom(false);
    }
  }, [allMessages, shouldAutoScroll]);

  // Initial scroll - either to first unread or to bottom
  useEffect(() => {
    if (!isLoading && !hasScrolledToUnread.current) {
      if (initialFirstUnreadMessageId.current && messageRefs.current.has(initialFirstUnreadMessageId.current)) {
        const element = messageRefs.current.get(initialFirstUnreadMessageId.current);
        if (element) {
          element.scrollIntoView({ behavior: 'auto', block: 'center' });
          hasScrolledToUnread.current = true;
          setShouldAutoScroll(false);
        }
      } else if (!initialFirstUnreadMessageId.current) {
        scrollToBottom(false);
        hasScrolledToUnread.current = true;
      }
    }
  }, [isLoading, initialFirstUnreadMessageId.current, messages]);

  const handleScrollToMessage = (messageId: number) => {
    // Use external callback if provided, otherwise use internal logic
    if (externalOnScrollToMessage) {
      externalOnScrollToMessage(messageId);
      return;
    }
    
    const element = messageRefs.current.get(messageId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setTimeout(() => {
        const rect = element.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        
        if (containerRect) {
          const isVisible = rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;
          
          if (isVisible) {
            setInternalHighlightedMessageId(messageId);
            setTimeout(() => setInternalHighlightedMessageId(null), 3000);
          }
        }
      }, 300);
    }
  };

  // Close reaction bar on scroll
  useEffect(() => {
    const handleScrollEvent = () => {
      if (activeMessageId !== null) {
        setActiveMessageId(null);
      }
    };

    window.addEventListener("scroll", handleScrollEvent, true);

    return () => {
      window.removeEventListener("scroll", handleScrollEvent, true);
    };
  }, [activeMessageId]);

  // Set up Intersection Observer to track visible messages
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const messageId = parseInt(entry.target.getAttribute('data-message-id') || '0');
          if (!messageId) return;

          if (entry.isIntersecting) {
            setVisibleMessages((prev) => new Set(prev).add(messageId));
          } else {
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
        threshold: 0.5,
      }
    );

    messageRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [messages]);

  // Mark messages from others as read once they've been on screen for 1.5s.
  // Each id is sent at most once, newly visible ids are batched into one request,
  // and messages already read by us are never re-sent, so polling refreshes
  // don't trigger new requests.
  const sentReadIdsRef = useRef<Set<number>>(new Set());
  const pendingReadIdsRef = useRef<Set<number>>(new Set());
  const readFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleMessagesRef = useRef(visibleMessages);
  visibleMessagesRef.current = visibleMessages;
  const showUnreadBadgeRef = useRef(showUnreadBadge);
  showUnreadBadgeRef.current = showUnreadBadge;

  useEffect(() => {
    visibleMessages.forEach((messageId) => {
      if (sentReadIdsRef.current.has(messageId) || pendingReadIdsRef.current.has(messageId)) return;
      const message = regularMessages.find((m) => m.id === messageId);
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
      if (seen.length === 0) return;

      const toSend = seen.filter((id) => !sentReadIdsRef.current.has(id));
      if (toSend.length > 0) {
        toSend.forEach((id) => sentReadIdsRef.current.add(id));
        fetch(`/api/events/${eventId}/messages/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message_ids: toSend }),
        }).catch((error) => {
          console.error('Failed to mark event messages as read:', error);
        });
      }

      const maxSeen = Math.max(...seen);
      setLastReadMessageId((prev) => (prev && prev > maxSeen ? prev : maxSeen));

      // If the first unread message has been read, dismiss the badge
      const firstUnreadId = initialFirstUnreadMessageId.current;
      if (showUnreadBadgeRef.current && firstUnreadId && seen.includes(firstUnreadId)) {
        setShowUnreadBadge(false);
        sessionStorage.setItem(`dismissedEventUnreadBadge_${eventId}`, firstUnreadId.toString());
      }
    }, 1500);
  }, [visibleMessages, regularMessages, currentUserId, eventId]);

  useEffect(() => {
    return () => {
      if (readFlushTimerRef.current) clearTimeout(readFlushTimerRef.current);
    };
  }, []);

  // Set up Intersection Observer for first unread message to dismiss badge
  useEffect(() => {
    if (!initialFirstUnreadMessageId.current || !showUnreadBadge) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            const rect = entry.boundingClientRect;
            const containerRect = containerRef.current?.getBoundingClientRect();
            
            if (containerRect && rect.bottom < containerRect.top) {
              setShowUnreadBadge(false);
              if (initialFirstUnreadMessageId.current) {
                sessionStorage.setItem(`dismissedEventUnreadBadge_${eventId}`, initialFirstUnreadMessageId.current.toString());
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
  }, [showUnreadBadge, eventId]);

  if (isLoading) {
    return (
      <EmptyState
        type="loading"
        title="Loading messages..."
        description="Fetching your event conversations"
      />
    );
  }

  if (allMessages.length === 0) {
    return (
      <EmptyState
        type="chat"
        title="No messages yet"
        description="Start a conversation with your event members"
      />
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto px-4 py-6 space-y-4"
      >
        {allMessages.map((message, index) => {
          // Check if this is an optimistic message
          const isOptimistic = 'isOptimistic' in message && message.isOptimistic;
          const optimisticMsg = isOptimistic ? (message as OptimisticMessage & { isOptimistic: true }) : null;
          const regularMsg = !isOptimistic ? (message as EventMessage) : null;
          const isOwnMessage = message.user_id === currentUserId;
          const prevMessage = index > 0 ? allMessages[index - 1] : null;
          const showDateSep = !isOptimistic && regularMsg ? shouldShowDateSeparator(regularMsg, prevMessage as EventMessage | null) : false;

          // Optimistic message rendering
          if (isOptimistic && optimisticMsg) {
            return (
              <div key={optimisticMsg.tempId} id={`event-message-${optimisticMsg.tempId}`}>
                <EventMessageBubble
                  message={{
                    id: 0, // Temp ID
                    event_id: optimisticMsg.event_id,
                    user_id: optimisticMsg.user_id,
                    user_name: optimisticMsg.user_name,
                    avatar_url: optimisticMsg.avatar_url,
                    room_number: optimisticMsg.room_number,
                    content: optimisticMsg.content,
                    created_at: optimisticMsg.created_at,
                    updated_at: optimisticMsg.created_at,
                    attachments: optimisticMsg.attachments?.map((att, idx) => ({
                      id: idx,
                      event_message_id: 0,
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
                  isActive={false}
                  onSetActive={() => {}}
                  onScrollToMessage={() => {}}
                  onImagePreview={onImagePreview}
                  optimisticStatus={optimisticMsg.status}
                  onRetry={() => onRetryMessage(optimisticMsg.tempId)}
                  onDelete={() => onDeleteOptimisticMessage(optimisticMsg.tempId)}
                />
              </div>
            );
          }

          // Regular message rendering
          if (!regularMsg) return null;

          return (
            <div key={regularMsg.id}>
              {/* Show date separator if needed */}
              {showDateSep && !regularMsg.is_join_message && !regularMsg.is_event_details && !regularMsg.is_leave_message && (
                <DateSeparator date={regularMsg.created_at} />
              )}
              
              {/* Show unread notification before the initial first unread message */}
              {!regularMsg.is_join_message && !regularMsg.is_event_details && !regularMsg.is_leave_message && showUnreadBadge && initialUnreadCount.current > 0 && regularMsg.id === initialFirstUnreadMessageId.current && (
                <div className="flex justify-center mb-4">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-full shadow-lg font-medium text-sm">
                    {initialUnreadCount.current} unread message{initialUnreadCount.current > 1 ? 's' : ''}
                  </div>
                </div>
              )}

              {/* Join message badge */}
              {regularMsg.is_join_message && !regularMsg.is_leave_message && (
                <div className="flex justify-center my-3">
                  <div className={`px-4 py-2 rounded-2xl shadow-soft dark:shadow-soft-dark max-w-sm backdrop-blur-sm ${
                    regularMsg.is_creator_join 
                      ? 'bg-gradient-to-r from-amber-500/90 to-amber-600/90 dark:from-amber-400/30 dark:to-amber-500/30 border-2 border-amber-600/70 dark:border-amber-400/60' 
                      : 'bg-primary-pine/90 dark:bg-primary-mint/20 border border-primary-pine/70 dark:border-primary-mint/40'
                  }`}>
                    <div className="flex items-center gap-3">
                      <img
                        src={getUserAvatar(regularMsg.user_id, regularMsg.avatar_url)}
                        alt={regularMsg.user_name}
                        className={`w-8 h-8 rounded-full object-cover shadow-sm ${
                          regularMsg.is_creator_join
                            ? 'border-2 border-amber-400/50'
                            : 'border-2 border-primary-mint/30'
                        }`}
                      />
                      <div>
                        <p className={`text-xs font-medium font-outfit ${
                          regularMsg.is_creator_join 
                            ? 'text-white dark:text-amber-400' 
                            : 'text-white dark:text-primary-mint'
                        }`}>
                          <span className="font-semibold">{regularMsg.user_name}</span>
                          {regularMsg.room_number && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-white/30 dark:bg-black/20 rounded text-[10px] font-semibold">
                              #{regularMsg.room_number}
                            </span>
                          )}
                          {regularMsg.is_creator_join ? ' created the event' : ' joined the event'}
                        </p>
                        {regularMsg.is_creator_join && (
                          <p className="text-[10px] font-semibold text-white/90 dark:text-amber-400 mt-0.5">
                            EVENT CREATOR
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Leave message badge */}
              {regularMsg.is_leave_message && (
                <div className="flex justify-center my-3">
                  <div className="px-4 py-2 rounded-2xl bg-slate-200/80 dark:bg-slate-700/50 border border-slate-300/50 dark:border-slate-600/50 max-w-sm">
                    <div className="flex items-center gap-3">
                      <img
                        src={getUserAvatar(regularMsg.user_id, regularMsg.avatar_url)}
                        alt={regularMsg.user_name}
                        className="w-8 h-8 rounded-full object-cover shadow-sm border-2 border-slate-400/30 grayscale opacity-70"
                      />
                      <div>
                        <p className="text-xs font-medium font-outfit text-slate-500 dark:text-slate-400">
                          <span className="font-semibold">{regularMsg.user_name}</span>
                          {regularMsg.room_number && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-slate-300/50 dark:bg-slate-600/50 rounded text-[10px] font-semibold">
                              #{regularMsg.room_number}
                            </span>
                          )}
                          {' left the conversation'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Regular message bubble */}
              {!regularMsg.is_join_message && !regularMsg.is_event_details && !regularMsg.is_leave_message && (
                <div
                  id={`event-message-${regularMsg.id}`}
                  data-message-id={regularMsg.id}
                  ref={(el) => {
                    if (el) {
                      messageRefs.current.set(regularMsg.id, el);
                      if (regularMsg.id === initialFirstUnreadMessageId.current) {
                        firstUnreadRef.current = el;
                      }
                    } else {
                      messageRefs.current.delete(regularMsg.id);
                      if (regularMsg.id === initialFirstUnreadMessageId.current) {
                        firstUnreadRef.current = null;
                      }
                    }
                  }}
                  className={`transition-all duration-300 rounded-2xl ${
                    highlightedMessageId === regularMsg.id 
                      ? 'bg-gradient-to-r from-emerald-100/50 via-teal-100/50 to-emerald-100/50 p-2 -m-2' 
                      : ''
                  }`}
                >
                  <EventMessageBubble
                    message={regularMsg}
                    isOwnMessage={isOwnMessage}
                    onMessageUpdated={onMessageUpdated}
                    onReply={() => onReply(regularMsg)}
                    isActive={activeMessageId === regularMsg.id}
                    onSetActive={(isActive) =>
                      setActiveMessageId(isActive ? regularMsg.id : null)
                    }
                    onScrollToMessage={handleScrollToMessage}
                    onImagePreview={onImagePreview}
                    onMessageInfo={onMessageInfo}
                    hideTimestamp={(() => {
                      const nextMsg = allMessages[index + 1];
                      if (!nextMsg || 'isOptimistic' in nextMsg) return false;
                      const next = nextMsg as EventMessage;
                      if (next.is_join_message || next.is_event_details || next.is_leave_message) return false;
                      if (next.user_id !== regularMsg.user_id) return false;
                      return new Date(next.created_at).getTime() - new Date(regularMsg.created_at).getTime() < 60000;
                    })()}
                  />
                </div>
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
          className="absolute left-1/2 -translate-x-1/2 p-3 bg-white hover:bg-slate-50 rounded-full shadow-lg border-2 border-slate-200 transition-all hover:scale-110 z-10 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
          }}
          title="Scroll to bottom"
        >
          <ChevronDown className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>
      )}
    </div>
  );
}
