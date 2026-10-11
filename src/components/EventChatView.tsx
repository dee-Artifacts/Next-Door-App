import { useState, useEffect, useRef } from "react";
import { usePolling } from "@/src/hooks/usePolling";
import { useChatSync } from "@/src/hooks/useChatSync";
import { useMessageCursor } from "@/src/hooks/useMessageCursor";
import { stopIfDenied } from "@/src/lib/session-guard";
import { useAuth } from "@/src/lib/auth-hook";
import ChatHeader from "@/src/components/ChatHeader";
import EventUserList from "@/src/components/EventUserList";
import EventMessageList from "@/src/components/EventMessageList";
import EventMessageInput from "@/src/components/EventMessageInput";
import ImagePreviewPanel from "@/src/components/ImagePreviewPanel";
import MessageInfoPanel from "@/src/components/MessageInfoPanel";
import EventDetailsModal from "@/src/components/EventDetailsModal";
import EventStatusBadge from "@/src/components/EventStatusBadge";
import { Calendar, Clock } from "lucide-react";
import EventExpiredModal from "@/src/components/EventExpiredModal";
import Onboarding from "@/src/components/Onboarding";
import CreatorModal from "@/src/components/CreatorModal";
import TypingIndicator from "@/src/components/TypingIndicator";
import { useTypingStatus } from "@/src/hooks/useTypingStatus";

interface EventMember {
  user_id: string;
  name: string;
  avatar_url: string | null;
  room_number: string | null;
  joined_at: string;
  is_creator?: boolean;
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
  sentMessageId?: number;
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
}

interface EventChatViewProps {
  eventId: number;
  eventName: string;
  onBack: () => void;
}

// Dissolve countdown for expired events
function DissolveCountdown({ endDatetime }: { endDatetime: string }) {
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const endDate = new Date(endDatetime);
      const expirationDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
      const now = new Date();
      const diff = expirationDate.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining("Expired");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [endDatetime]);

  return (
    <div className="inline-flex flex-col items-center gap-1 px-4 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 dark:from-amber-500/30 dark:to-orange-500/30 border-2 border-amber-500 dark:border-amber-400 rounded-button-rect animate-pulse">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-300 font-outfit">
          Dissolving in {timeRemaining}
        </span>
      </div>
      <span className="text-xs text-amber-600 dark:text-amber-400 font-outfit">
        All messages & attachments will be deleted
      </span>
    </div>
  );
}

export default function EventChatView({ eventId, eventName, onBack }: EventChatViewProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<EventMember[]>([]);
  const [messages, setMessages] = useState<EventMessage[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt?: string } | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [eventDetails, setEventDetails] = useState<{
    name: string;
    description: string | null;
    location?: string | null;
    start_datetime: string;
    end_datetime: string;
    max_members: number;
    image_url: string | null;
  } | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: number; user_name: string; content: string } | null>(null);
  const [isEventExpired, setIsEventExpired] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [showMessageInfo, setShowMessageInfo] = useState(false);
  const [messageInfoId, setMessageInfoId] = useState<number | null>(null);
  
  const { typingUsers, updateTypingUsers, sendTypingStatus } = useTypingStatus({ groupType: "event", groupId: String(eventId) });
  // First fetch loads the whole chat; later ones only what changed
  const messageCursor = useMessageCursor(`event:${eventId}`, setMessages);

  useEffect(() => {
    fetchMembers();
    fetchEventDetails();
    fetchMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Poll messages (and who is typing) every 5 seconds; details and members change rarely
  usePolling(() => fetchMessages(), 5000);
  usePolling(() => Promise.all([fetchMembers(), fetchEventDetails()]), 30_000);
  // While idle: one check for message changes every 5 minutes instead of the polls above
  useChatSync({ chat: `event:${eventId}`, cursor: messageCursor });

  // Remove optimistic messages when their real counterparts arrive
  useEffect(() => {
    if (optimisticMessages.length === 0) return;
    
    // Create a more robust matching system
    const toRemove = optimisticMessages.filter(opt => {
      // First, try to match by sentMessageId if available
      if (opt.sentMessageId) {
        const foundById = messages.some(m => m.id === opt.sentMessageId);
        if (foundById) return true;
      }
      
      // Fallback: match by content, user_id, and approximate timestamp (within 10 seconds)
      const optTimestamp = new Date(opt.created_at).getTime();
      const foundByContent = messages.some(m => {
        const msgTimestamp = new Date(m.created_at).getTime();
        const timeDiff = Math.abs(msgTimestamp - optTimestamp);
        
        return (
          m.content === opt.content &&
          m.user_id === opt.user_id &&
          timeDiff < 10000 // Within 10 seconds
        );
      });
      
      return foundByContent;
    });
    
    if (toRemove.length > 0) {
      const tempIdsToRemove = new Set(toRemove.map(m => m.tempId));
      setOptimisticMessages(prev => 
        prev.filter(opt => !tempIdsToRemove.has(opt.tempId))
      );
    }
  }, [messages, optimisticMessages]);

  const fetchMessages = async () => {
    const ticket = messageCursor.begin();
    ticket.params.set('with_typing', '1');
    try {
      const response = await fetch(`/api/events/${eventId}/messages?${ticket.params}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const body = await response.json();
        const data = Array.isArray(body) ? body : body.messages;
        updateTypingUsers(body.typing_users);
        
        // Defensive check: ensure data is an array
        if (Array.isArray(data)) {
          // Extract event details from the first event_details message
          const detailsMessage = data.find((msg: any) => msg.is_event_details && msg.event_details);
          if (detailsMessage && detailsMessage.event_details) {
            setEventDetails(detailsMessage.event_details);
          }
          
          messageCursor.apply(ticket, data, body.cursor);
          // Read receipts are sent by EventMessageList as messages come into view
        } else {
          console.error("Invalid response format from /api/events/:id/messages:", data);
          messageCursor.reset();
          setMessages([]);
        }
      } else {
        messageCursor.reset();
        setMessages([]);
        return stopIfDenied(response);
      }
    } catch (error) {
      console.error("Error fetching event messages:", error);
      messageCursor.reset();
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const fetchEventDetails = async () => {
    try {
      const response = await fetch(`/api/events/my`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        
        // Defensive check: ensure events is an array
        if (!data || !Array.isArray(data.events)) {
          console.error("Invalid response format from /api/events/my:", data);
          return;
        }
        
        const event = data.events.find((e: any) => e.id === eventId);
        if (event) {
          setIsCreator(event.is_creator === 1 || event.is_creator === true);
          
          // Update event details from the event object
          setEventDetails({
            name: event.name,
            description: event.description || null,
            location: event.location || null,
            start_datetime: event.start_datetime,
            end_datetime: event.end_datetime,
            max_members: event.max_members,
            image_url: event.image_url || null,
          });
          
          // Check if event is deleted (soft delete sets year to 2000)
          if (event.end_datetime?.startsWith('2000-')) {
            // Event has been deleted - redirect to main group
            onBack();
            return;
          }

          // Check if event is expired (ended but within 24 hour grace period)
          const isExpired = event.is_expired === 1 || event.is_expired === true;
          console.log('[EventChatView] Event expiration check:', {
            eventId,
            end_datetime: event.end_datetime,
            is_expired_raw: event.is_expired,
            is_expired_computed: isExpired,
            current_time: new Date().toISOString(),
          });
          setIsEventExpired(isExpired);

          // Check if 24 hour grace period has ended
          if (event.end_datetime) {
            const endDate = new Date(event.end_datetime);
            const expirationDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
            const now = new Date();
            
            if (now >= expirationDate) {
              // Grace period ended - redirect to main group
              onBack();
              return;
            }
          }
        } else {
          // Event not found in user's events - they've been removed or it's deleted
          onBack();
          return;
        }
      } else {
        return stopIfDenied(response);
      }
    } catch (error) {
      console.error("Error fetching event details:", error);
      // Don't redirect on network errors - just log and continue
    }
  };

  const fetchMembers = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/members`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        
        // Defensive check: ensure members is an array
        if (!data || !Array.isArray(data.members)) {
          console.error("Invalid response format from /api/events/:id/members:", data);
          setMembers([]);
        } else {
          setMembers(data.members);
        }
      } else {
        return stopIfDenied(response);
      }
    } catch (error) {
      console.error("Error fetching event members:", error);
      setMembers([]);
    }
  };

  const handleExitEvent = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/leave`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        onBack();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to exit event');
      }
    } catch (error) {
      console.error('Error exiting event:', error);
      alert('Failed to exit event');
    }
  };

  const handleDeleteEvent = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        onBack();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete event');
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event');
    }
  };

  const handleImagePreview = (imageUrl: string, altText?: string) => {
    setPreviewImage({ url: imageUrl, alt: altText });
    setShowImagePreview(true);
  };

  const handleReply = (message: any) => {
    setReplyTo({
      id: message.id,
      user_name: message.user_name,
      content: message.content
    });
  };

  const handleScrollToMessage = (messageId: number) => {
    const element = document.getElementById(`event-message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setTimeout(() => {
        const rect = element.getBoundingClientRect();
        const containerRect = messagesContainerRef.current?.getBoundingClientRect();
        
        if (containerRect) {
          const isVisible = rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;
          
          if (isVisible) {
            setHighlightedMessageId(messageId);
            setTimeout(() => setHighlightedMessageId(null), 3000);
          }
        }
      }, 300);
    }
  };

  const handleOptimisticMessage = async (
    content: string,
    attachments: Array<{ file: File; preview?: string }>,
    replyToMessageId?: number
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
      event_id: eventId,
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
    };

    // Get reply data if replying
    if (replyToMessageId) {
      const replyMsg = messages.find(m => m.id === replyToMessageId);
      if (replyMsg) {
        optimisticMsg.reply_to_content = replyMsg.content;
        optimisticMsg.reply_to_user_id = replyMsg.user_id;
        optimisticMsg.reply_to_user_name = replyMsg.user_name;
      }
    }

    // Add to optimistic messages
    setOptimisticMessages(prev => [...prev, optimisticMsg]);

    // Auto-scroll to the optimistic message
    setTimeout(() => {
      const element = document.getElementById(`event-message-${tempId}`);
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
          response = await fetch(`/api/events/${eventId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            credentials: 'include',
            body: JSON.stringify({
              content,
              reply_to_message_id: replyToMessageId,
              attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
            })
          });
          
          if (response.ok) {
            break; // Success, exit retry loop
          }
          
          // Log the error for debugging
          const errorData = await response.json().catch(() => ({ error: `HTTP ${response?.status}` }));
          lastError = errorData.error || `HTTP ${response.status}`;
          console.error(`[Event Message Send] Attempt ${attempt + 1} failed:`, lastError, 'Status:', response.status);
          
          // If it's a client error (4xx), don't retry
          if (response.status >= 400 && response.status < 500) {
            break;
          }
          
          // Wait before retrying (exponential backoff)
          if (attempt < 1) {
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          }
        } catch (fetchError) {
          console.error(`[Event Message Send] Attempt ${attempt + 1} network error:`, fetchError);
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
        await fetchMessages();
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

      const response = await fetch(`/api/events/${eventId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: 'include',
        body: JSON.stringify({
          content: msg.content,
          reply_to_message_id: msg.reply_to_message_id,
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
        await fetchMessages();
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

  // Header element with Event Details button
  const headerActionsElement = (
    <button
      onClick={() => isEventExpired ? setShowExpiredModal(true) : setShowEventDetails(true)}
      className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 text-white font-outfit font-medium text-sm rounded-button-rect transition-all backdrop-blur-sm hover:scale-105"
      title="Event Details"
    >
      <Calendar className="w-4 h-4" />
      <span className="hidden sm:inline">Details</span>
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-light-bg to-slate-100 dark:from-dark-ocean dark:to-dark-ocean" style={{ height: '100dvh' }}>
      <ChatHeader
        onToggleUserList={() => setShowMembersPanel(!showMembersPanel)}
        onEditProfile={() => {}}
        onToggleNotifications={() => {}}
        onToggleSearch={() => {}}
        onShowOnboarding={() => setShowOnboarding(true)}
        onShowCreator={() => setShowCreator(true)}
        userCount={members.length}
        isAdmin={false}
        notificationCount={0}
        groupName={eventName}
        showBackButton={true}
        onBack={onBack}
        onExitEvent={handleExitEvent}
        onDeleteEvent={handleDeleteEvent}
        isEventCreator={isCreator}
        customHeaderElement={headerActionsElement}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Event Status Badge - pinned area */}
          {eventDetails && (
            <div className="px-4 pt-3 pb-2">
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {isEventExpired ? (
                  <DissolveCountdown endDatetime={eventDetails.end_datetime} />
                ) : (
                  <EventStatusBadge 
                    startDatetime={eventDetails.start_datetime}
                    endDatetime={eventDetails.end_datetime}
                  />
                )}
              </div>
            </div>
          )}
          
          <EventMessageList 
            messages={messages}
            optimisticMessages={optimisticMessages}
            currentUserId={user?.id || ''}
            isLoading={isLoadingMessages}
            onImagePreview={handleImagePreview}
            onReply={handleReply}
            onMessageUpdated={fetchMessages}
            eventId={eventId}
            highlightedMessageId={highlightedMessageId}
            onScrollToMessage={handleScrollToMessage}
            onRetryMessage={handleRetryMessage}
            onDeleteOptimisticMessage={handleDeleteOptimisticMessage}
            onMessageInfo={(messageId) => {
              setMessageInfoId(messageId);
              setShowMessageInfo(true);
            }}
          />
          <TypingIndicator typingUsers={typingUsers} />
          <EventMessageInput 
            onOptimisticMessage={handleOptimisticMessage}
            eventId={eventId}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onTyping={sendTypingStatus}
          />
        </div>

        {/* Desktop Image Preview Panel */}
        {showImagePreview && previewImage && (
          <div className="hidden lg:block w-[600px] border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <ImagePreviewPanel
              imageUrl={previewImage.url}
              altText={previewImage.alt}
              onClose={() => {
                setShowImagePreview(false);
                setPreviewImage(null);
              }}
            />
          </div>
        )}

        {/* Desktop/Laptop panel - appears inside layout */}
        {showMembersPanel && (
          <div className="hidden lg:block w-80 border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <EventUserList
              users={members}
              currentUserId={user?.id || ''}
              onClose={() => setShowMembersPanel(false)}
            />
          </div>
        )}

        {/* Desktop Message Info Panel */}
        {showMessageInfo && messageInfoId && (
          <div className="hidden lg:block w-80 border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <MessageInfoPanel
              messageId={messageInfoId}
              onClose={() => {
                setShowMessageInfo(false);
                setMessageInfoId(null);
              }}
              groupType="event"
              eventId={eventId}
            />
          </div>
        )}
      </div>

      {/* Mobile/Tablet overlay - covers full screen */}
      {showMembersPanel && user && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => setShowMembersPanel(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <EventUserList
              users={members}
              currentUserId={user.id}
              onClose={() => setShowMembersPanel(false)}
            />
          </div>
        </div>
      )}

      {/* Mobile Image Preview Overlay */}
      {showImagePreview && previewImage && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => {
          setShowImagePreview(false);
          setPreviewImage(null);
        }}>
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-[600px] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <ImagePreviewPanel 
              imageUrl={previewImage.url}
              altText={previewImage.alt}
              onClose={() => {
                setShowImagePreview(false);
                setPreviewImage(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Mobile Message Info Overlay */}
      {showMessageInfo && messageInfoId && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => {
          setShowMessageInfo(false);
          setMessageInfoId(null);
        }}>
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <MessageInfoPanel
              messageId={messageInfoId}
              onClose={() => {
                setShowMessageInfo(false);
                setMessageInfoId(null);
              }}
              groupType="event"
              eventId={eventId}
            />
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      <EventDetailsModal
        isOpen={showEventDetails}
        onClose={() => setShowEventDetails(false)}
        eventDetails={eventDetails}
      />

      {/* Event Expired Modal */}
      {eventDetails && (
        <EventExpiredModal
          isOpen={showExpiredModal}
          onClose={() => setShowExpiredModal(false)}
          eventName={eventDetails.name}
          endDatetime={eventDetails.end_datetime}
        />
      )}

      {/* Onboarding modal */}
      {showOnboarding && (
        <Onboarding isModal={true} onClose={() => setShowOnboarding(false)} />
      )}

      {/* Creator modal */}
      {showCreator && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => setShowCreator(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <CreatorModal onClose={() => setShowCreator(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
