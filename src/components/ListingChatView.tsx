import { useState, useEffect, useRef } from "react";
import { usePolling } from "@/src/hooks/usePolling";
import { READ_RECEIPT_DELAY_MS, readBySomeoneElse, useRealtime, useSignalRefresh } from "@/src/hooks/useRealtime";
import { useChatSync } from "@/src/hooks/useChatSync";
import { useMessageCursor } from "@/src/hooks/useMessageCursor";
import { stopIfDenied } from "@/src/lib/session-guard";
import { useAuth } from "@/src/lib/auth-hook";
import { Package, CheckCircle, X } from "lucide-react";
import ListingMessageList, { ListingMessageListRef } from "./ListingMessageList";
import ListingMessageInput from "./ListingMessageInput";
import ImagePreviewPanel from "./ImagePreviewPanel";
import TypingIndicator from "./TypingIndicator";
import ChatHeader from "./ChatHeader";
import ListingDetailsModal from "./ListingDetailsModal";
import ListingMembersPanel from "./ListingMembersPanel";
import { useTypingStatus } from "@/src/hooks/useTypingStatus";
import { getUserAvatar } from "@/src/utils/avatars";
import { ListingMessage } from "./ListingMessageBubble";

interface ListingMember {
  user_id: string;
  name: string;
  avatar_url: string | null;
  room_number: string | null;
  is_creator?: boolean;
  joined_at?: string;
}

interface ListingDetails {
  id: number;
  title: string;
  description: string;
  type: 'offering' | 'requesting';
  is_free: boolean | number;
  price?: number | null;
  status: string;
  creator_user_id: string;
  creator_name?: string;
  creator_avatar?: string;
  images?: string[];
}

interface OptimisticMessage extends ListingMessage {
  tempId: string;
  status: 'sending' | 'failed';
  attachmentFiles?: Array<{ file: File; preview?: string }>;
}

interface ListingChatViewProps {
  listingId: number;
  onBack: () => void;
}

export default function ListingChatView({ listingId, onBack }: ListingChatViewProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ListingMessage[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [members, setMembers] = useState<ListingMember[]>([]);
  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt?: string } | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: number; user_name: string; content: string } | null>(null);
  const [showListingDetails, setShowListingDetails] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeConfirmText, setCompleteConfirmText] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [selectedHelpers, setSelectedHelpers] = useState<string[]>([]);

  const messageListRef = useRef<ListingMessageListRef>(null);
  const { typingUsers, updateTypingUsers, addTypingUser, sendTypingStatus } = useTypingStatus({ groupType: "listing", groupId: String(listingId) });

  // Fetch listing details
  useEffect(() => {
    const fetchListing = async () => {
      try {
        const response = await fetch(`/api/market/listings/${listingId}`, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setListing(data.listing);
        }
      } catch (error) {
        console.error("Error fetching listing:", error);
      }
    };
    fetchListing();
  }, [listingId]);

  // Fetch messages: the first fetch loads the whole chat; later ones only what changed
  const messageCursor = useMessageCursor(`listing:${listingId}`, setMessages);
  const fetchMessages = async () => {
    const ticket = messageCursor.begin();
    ticket.params.set('with_typing', '1');
    try {
      const response = await fetch(`/api/listings/${listingId}/messages?${ticket.params}`, { credentials: 'include' });
      if (response.ok) {
        const body = await response.json();
        const data = Array.isArray(body) ? body : body.messages;
        messageCursor.apply(ticket, Array.isArray(data) ? data : [], body.cursor);
        updateTypingUsers(body.typing_users);
      } else {
        return stopIfDenied(response);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    fetchMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);
  // Realtime: while listing:<id> is live, signals replace the polls here; they resume when it is not
  const refreshMessagesOnSignal = useSignalRefresh(() => fetchMessages(), false);
  const refreshMembersOnSignal = useSignalRefresh(() => fetchMembers(), false);
  const live = useRealtime(`listing:${listingId}`, (signal) => {
    if (signal.event === "members") return refreshMembersOnSignal();
    if (signal.event === "read") {
      // Someone else's read receipts: soon is enough (my own reads change nothing here)
      if (readBySomeoneElse(signal, user?.id)) refreshMessagesOnSignal(READ_RECEIPT_DELAY_MS);
      return;
    }
    if (signal.event !== "typing") return refreshMessagesOnSignal(); // changed
    const typingId = String(signal.payload.user_id ?? "");
    if (!typingId || typingId === user?.id) return;
    const typist = members.find((m) => m.user_id === typingId);
    if (typist) addTypingUser(typist);
    else refreshMessagesOnSignal(); // not in the member list yet: the fetch returns who is typing
  });
  // One catch-up fetch each time the topic goes live
  useEffect(() => {
    if (live) refreshMessagesOnSignal();
  }, [live, refreshMessagesOnSignal]);

  // Poll messages (and who is typing) every 5 seconds
  usePolling(fetchMessages, live ? null : 5000);

  // Fetch members
  const fetchMembers = async () => {
    try {
      const response = await fetch(`/api/listings/${listingId}/members`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const newMembers: ListingMember[] = Array.isArray(data.members) ? data.members : [];
        setMembers(newMembers);
      } else {
        return stopIfDenied(response);
      }
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };
  useEffect(() => {
    fetchMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);
  usePolling(fetchMembers, live ? null : 30_000);
  // While idle: one check for message changes every 5 minutes instead of the polls above
  useChatSync({ chat: `listing:${listingId}`, cursor: messageCursor, live });

  // Remove optimistic messages when confirmed
  useEffect(() => {
    if (optimisticMessages.length === 0) return;
    const toRemove = optimisticMessages.filter(opt => {
      const optTime = new Date(opt.created_at).getTime();
      return messages.some(m => 
        m.content === opt.content && 
        m.user_id === opt.user_id && 
        Math.abs(new Date(m.created_at).getTime() - optTime) < 10000
      );
    });
    if (toRemove.length > 0) {
      setOptimisticMessages(prev => prev.filter(opt => !toRemove.some(r => r.tempId === opt.tempId)));
    }
  }, [messages, optimisticMessages]);

  const handleOptimisticMessage = async (
    content: string,
    attachments: Array<{ file: File; preview?: string }>,
    replyToMessageId?: number
  ) => {
    if (!user) return;

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    
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
      id: 0,
      tempId,
      listing_id: listingId,
      user_id: user.id,
      user_name: userName,
      avatar_url: avatarUrl,
      room_number: roomNumber,
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'sending',
      attachmentFiles: attachments,
      reply_to_message_id: replyToMessageId,
    };

    if (replyToMessageId) {
      const replyMsg = messages.find(m => m.id === replyToMessageId);
      if (replyMsg) {
        optimisticMsg.reply_to_content = replyMsg.content;
        optimisticMsg.reply_to_user_id = replyMsg.user_id;
        optimisticMsg.reply_to_user_name = replyMsg.user_name;
      }
    }

    setOptimisticMessages(prev => [...prev, optimisticMsg]);
    setReplyTo(null);

    setTimeout(() => messageListRef.current?.scrollToBottom(), 50);

    try {
      let uploadedAttachments: Array<{
        filename: string;
        file_key: string;
        file_size: number;
        content_type: string;
      }> = [];

      for (const attachment of attachments) {
        const formData = new FormData();
        formData.append('file', attachment.file);
        formData.append('type', 'message');
        const uploadResponse = await fetch('/api/files', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        if (!uploadResponse.ok) throw new Error('Failed to upload file');
        const uploadData = await uploadResponse.json();
        uploadedAttachments.push({
          filename: attachment.file.name,
          file_key: uploadData.file_key,
          file_size: attachment.file.size,
          content_type: attachment.file.type
        });
      }

      let response: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetch(`/api/listings/${listingId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: 'include',
            body: JSON.stringify({
              content,
              reply_to_message_id: replyToMessageId,
              attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
            })
          });
          if (response.ok) break;
          if (response.status >= 400 && response.status < 500) break;
          if (attempt < 1) await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          if (attempt < 1) await new Promise(r => setTimeout(r, 500));
        }
      }

      if (!response?.ok) {
        setOptimisticMessages(prev => prev.map(m => 
          m.tempId === tempId ? { ...m, status: 'failed' } : m
        ));
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setOptimisticMessages(prev => prev.map(m => 
        m.tempId === tempId ? { ...m, status: 'failed' } : m
      ));
    }
  };

  const handleRetryMessage = async (tempId: string) => {
    const msg = optimisticMessages.find(m => m.tempId === tempId);
    if (!msg) return;
    setOptimisticMessages(prev => prev.filter(m => m.tempId !== tempId));
    handleOptimisticMessage(msg.content, msg.attachmentFiles || [], msg.reply_to_message_id || undefined);
  };

  const handleDeleteOptimisticMessage = (tempId: string) => {
    setOptimisticMessages(prev => prev.filter(m => m.tempId !== tempId));
  };

  const handleReply = (message: ListingMessage) => {
    setReplyTo({ id: message.id, user_name: message.user_name, content: message.content });
  };

  const handleImagePreview = (url: string, alt?: string) => {
    setPreviewImage({ url, alt });
    setShowImagePreview(true);
  };

  const isCreator = listing?.creator_user_id === user?.id;

  const handleExitListing = async () => {
    try {
      const response = await fetch(`/api/market/listings/${listingId}/interest`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        onBack();
      }
    } catch (error) {
      console.error("Failed to exit listing:", error);
    }
  };

  const handleDeleteListing = async () => {
    try {
      const response = await fetch(`/api/market/listings/${listingId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        onBack();
      }
    } catch (error) {
      console.error("Failed to delete listing:", error);
    }
  };

  const handleCompleteListing = async () => {
    if (completeConfirmText !== "complete" || isCompleting) return;
    setIsCompleting(true);
    try {
      const response = await fetch(`/api/market/listings/${listingId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ helper_user_ids: selectedHelpers })
      });
      if (response.ok) {
        onBack();
      }
    } catch (error) {
      console.error("Failed to complete listing:", error);
    } finally {
      setIsCompleting(false);
      setShowCompleteModal(false);
      setCompleteConfirmText("");
      setSelectedHelpers([]);
    }
  };

  const combinedMessages = [
    ...messages,
    ...optimisticMessages.map(m => ({
      ...m,
      onRetry: () => handleRetryMessage(m.tempId),
      onDelete: () => handleDeleteOptimisticMessage(m.tempId),
    }))
  ];

  const headerActionsElement = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowListingDetails(true)}
        className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 text-white font-outfit font-medium text-sm rounded-button-rect transition-all backdrop-blur-sm hover:scale-105"
        title="Request Details"
      >
        <Package className="w-4 h-4" />
        <span className="hidden sm:inline">Details</span>
      </button>
      {isCreator && (
        <button
          onClick={() => setShowCompleteModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 text-primary-pine dark:text-white font-outfit font-medium text-sm rounded-button-rect transition-all backdrop-blur-sm hover:scale-105"
          title="Mark as Complete"
        >
          <CheckCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Complete</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-light-bg to-slate-100 dark:from-dark-ocean dark:to-dark-ocean" style={{ height: '100dvh' }}>
      <ChatHeader
        onToggleUserList={() => setShowMembersPanel(!showMembersPanel)}
        onEditProfile={() => {}}
        onToggleNotifications={() => {}}
        userCount={members.length}
        isAdmin={false}
        notificationCount={0}
        groupName={listing?.title || 'Request Chat'}
        showBackButton={true}
        onBack={onBack}
        isListingChat={true}
        onExitListing={!isCreator ? handleExitListing : undefined}
        onDeleteListing={isCreator ? handleDeleteListing : undefined}
        isListingCreator={isCreator}
        customHeaderElement={headerActionsElement}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <ListingMessageList
            ref={messageListRef}
            messages={messages}
            currentUserId={user?.id || ''}
            onMessageUpdated={() => {}}
            onReply={handleReply}
            onImagePreview={handleImagePreview}
            optimisticMessages={combinedMessages.filter(m => 'status' in m) as any}
            isLoading={isLoading}
          />

          <TypingIndicator typingUsers={typingUsers} />

          <ListingMessageInput
            onOptimisticMessage={handleOptimisticMessage}
            listingId={listingId}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onTyping={sendTypingStatus}
          />
        </div>

        {showMembersPanel && (
          <div className="hidden lg:block w-80 border-l border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
            <ListingMembersPanel
              members={members}
              currentUserId={user?.id || ''}
              onClose={() => setShowMembersPanel(false)}
            />
          </div>
        )}
      </div>

      {showMembersPanel && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in" onClick={() => setShowMembersPanel(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <ListingMembersPanel
              members={members}
              currentUserId={user?.id || ''}
              onClose={() => setShowMembersPanel(false)}
            />
          </div>
        </div>
      )}

      <ListingDetailsModal
        isOpen={showListingDetails}
        onClose={() => setShowListingDetails(false)}
        listing={listing}
      />

      {showImagePreview && previewImage && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]" onClick={() => { setShowImagePreview(false); setPreviewImage(null); }}>
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-[600px] bg-white dark:bg-dark-ocean shadow-lg animate-slide-in-right" onClick={e => e.stopPropagation()}>
            <ImagePreviewPanel
              imageUrl={previewImage.url}
              altText={previewImage.alt}
              onClose={() => { setShowImagePreview(false); setPreviewImage(null); }}
            />
          </div>
        </div>
      )}

      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => { setShowCompleteModal(false); setCompleteConfirmText(""); setSelectedHelpers([]); }}>
          <div className="bg-white dark:bg-dark-surface rounded-3xl w-full max-w-sm shadow-xl animate-scale-in relative" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-outfit font-semibold text-slate-800 dark:text-white mb-2">Mark as Complete?</h3>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-4">
                We hope your request was fulfilled! 🎉
              </p>
              
              {/* Helped by selection */}
              {members.filter(m => m.user_id !== user?.id).length > 0 && (
                <div className="mb-4 text-left">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Helped by (optional):</p>
                  <div className="max-h-[140px] overflow-y-auto space-y-2 pr-1">
                    {members.filter(m => m.user_id !== user?.id).map((member) => (
                      <label
                        key={member.user_id}
                        className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${
                          selectedHelpers.includes(member.user_id)
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700'
                            : 'bg-slate-50 dark:bg-dark-elevated border border-transparent hover:bg-slate-100 dark:hover:bg-dark-elevated/80'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedHelpers.includes(member.user_id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedHelpers(prev => [...prev, member.user_id]);
                            } else {
                              setSelectedHelpers(prev => prev.filter(id => id !== member.user_id));
                            }
                          }}
                          className="sr-only"
                        />
                        <img
                          src={getUserAvatar(member.user_id, member.avatar_url)}
                          alt={member.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{member.name}</p>
                          {member.room_number && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">#{member.room_number}</p>
                          )}
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selectedHelpers.includes(member.user_id)
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}>
                          {selectedHelpers.includes(member.user_id) && (
                            <CheckCircle className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                This will delete all messages and attachments from this request. This action cannot be undone.
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                Type <span className="font-semibold text-slate-700 dark:text-slate-300">"complete"</span> to confirm
              </p>
              <input
                type="text"
                value={completeConfirmText}
                onChange={(e) => setCompleteConfirmText(e.target.value)}
                placeholder='Type "complete"'
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-elevated text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCompleteModal(false); setCompleteConfirmText(""); setSelectedHelpers([]); }}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-elevated transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompleteListing}
                  disabled={completeConfirmText !== "complete" || isCompleting}
                  className="flex-1 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-medium transition-colors disabled:cursor-not-allowed"
                >
                  {isCompleting ? "Completing..." : "Complete"}
                </button>
              </div>
            </div>
            <button
              onClick={() => { setShowCompleteModal(false); setCompleteConfirmText(""); setSelectedHelpers([]); }}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
