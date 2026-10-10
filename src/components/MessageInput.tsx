import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, X, Smile } from "lucide-react";
import EmojiPicker from "@/src/components/EmojiPicker";
import MentionAutocomplete from "@/src/components/MentionAutocomplete";
import type { User } from "@/src/hooks/useUsers";

interface MessageInputProps {
  onOptimisticMessage: (content: string, attachments: Array<{ file: File; preview?: string }>, replyToMessageId?: number, hashtagId?: number) => void;
  replyToMessage: {
    id: number;
    user_name: string;
    content: string;
  } | null;
  onCancelReply: () => void;
  groupId?: string;
  onTyping?: () => void;
  /** Everyone in the chat, for @mention autocomplete (ChatLayout already polls this) */
  users: User[];
}

export default function MessageInput({
  onOptimisticMessage,
  replyToMessage,
  onCancelReply,
  onTyping,
  users,
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<Array<{
    file: File;
    preview?: string;
  }>>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartPos, setMentionStartPos] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 96;
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  }, [message]);

  useEffect(() => {
    if (replyToMessage) {
      textareaRef.current?.focus();
    }
  }, [replyToMessage]);

  const MAX_ATTACHMENTS = 5;
  const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Check how many more attachments we can add
    const remainingSlots = MAX_ATTACHMENTS - attachments.length;
    if (remainingSlots <= 0) {
      alert(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
      return;
    }
    
    // Filter and validate files
    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" exceeds the 4 MB limit`);
        continue;
      }
      if (validFiles.length < remainingSlots) {
        validFiles.push(file);
      }
    }
    
    if (files.length > remainingSlots) {
      alert(`Only ${remainingSlots} more attachment${remainingSlots === 1 ? '' : 's'} allowed`);
    }
    
    const newAttachments = validFiles.map(file => {
      const attachment: {
        file: File;
        preview?: string;
      } = {
        file
      };
      if (file.type.startsWith("image/")) {
        attachment.preview = URL.createObjectURL(file);
      }
      return attachment;
    });
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const updated = [...prev];
      if (updated[index].preview) {
        URL.revokeObjectURL(updated[index].preview!);
      }
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);

    // Send typing status
    if (value.length > 0) {
      onTyping?.();
    }

    // Check for @ mention
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionStartPos(cursorPos - mentionMatch[0].length);
    } else {
      setMentionQuery(null);
    }
  };

  const handleMentionSelect = (user: any) => {
    if (mentionQuery === null) return;
    const beforeMention = message.slice(0, mentionStartPos);
    const afterMention = message.slice(mentionStartPos + mentionQuery.length + 1);
    const mentionText = `@${user.name} `;
    const newMessage = beforeMention + mentionText + afterMention;
    setMessage(newMessage);
    setMentionQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + mentionText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleSubmit = () => {
    if (!message.trim() && attachments.length === 0) return;
    
    const sanitizedMessage = message.trim();
    
    // Call optimistic message handler immediately
    onOptimisticMessage(sanitizedMessage, attachments, replyToMessage?.id);
    
    // Clear form immediately for instant feedback
    setMessage("");
    setAttachments([]);
    onCancelReply();
  };

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-ocean backdrop-blur-xl sticky bottom-0 z-50" style={{
      paddingTop: '12px',
      paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      paddingLeft: '12px',
      paddingRight: '12px'
    }}>
      {replyToMessage && (
        <div className="mb-3 p-3 bg-primary-mint/10 dark:bg-primary-mint/20 border-l-4 border-primary-mint rounded-r-button-rect flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-primary-mint mb-1 font-outfit">
              Replying to {replyToMessage.user_name}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 font-outfit">
              {replyToMessage.content}
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 hover:bg-primary-mint/20 rounded transition-colors flex-shrink-0 ml-2"
            title="Cancel reply"
          >
            <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div key={index} className="relative group">
              {attachment.preview ? (
                <div className="relative">
                  <img
                    src={attachment.preview}
                    alt="Preview"
                    className="w-20 h-20 object-cover rounded-button-rect border-2 border-slate-200 dark:border-slate-700 shadow-soft"
                  />
                  <button
                    onClick={() => removeAttachment(index)}
                    className="absolute -top-2 -right-2 p-1 bg-error text-white rounded-full shadow-md hover:scale-110 transition-transform"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="relative flex items-center gap-2 px-3 py-2 bg-light-surface dark:bg-dark-surface rounded-button-rect border-2 border-slate-200 dark:border-slate-700 shadow-soft">
                  <Paperclip className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-300 max-w-32 truncate font-outfit">
                    {attachment.file.name}
                  </span>
                  <button
                    onClick={() => removeAttachment(index)}
                    className="p-1 bg-error text-white rounded-full hover:scale-110 transition-transform"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-s items-end">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachments.length >= MAX_ATTACHMENTS}
          className="p-2 sm:p-2.5 rounded-button-rect bg-light-surface dark:bg-dark-surface hover:bg-slate-200 dark:hover:bg-dark-elevated text-slate-600 dark:text-slate-400 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          title={attachments.length >= MAX_ATTACHMENTS ? "Maximum 5 attachments" : "Attach file"}
        >
          <Paperclip className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        </button>

        <div className="relative hidden lg:block">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2.5 rounded-button-rect bg-light-surface dark:bg-dark-surface hover:bg-slate-200 dark:hover:bg-dark-elevated text-slate-600 dark:text-slate-400 transition-all hover:scale-105"
            title="Add emoji"
          >
            <Smile className="w-[18px] h-[18px]" />
          </button>

          {showEmojiPicker && (
            <div className="absolute bottom-full mb-2 left-0 z-10">
              <EmojiPicker
                onEmojiSelect={handleEmojiSelect}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center gap-2 px-m rounded-button-rect bg-light-surface dark:bg-dark-surface border-2 border-transparent focus-within:border-primary-mint focus-within:bg-white dark:focus-within:bg-dark-elevated transition-all min-w-0 relative">
          <textarea
            ref={textareaRef}
            id="main-group-message-input"
            name="message"
            value={message}
            onChange={handleInputChange}
            placeholder={replyToMessage ? "Type your reply..." : "Type a message..."}
            className="w-full py-2 sm:py-2.5 bg-transparent outline-none text-sm sm:text-base min-w-0 resize-none overflow-y-auto font-outfit text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            rows={1}
            style={{
              maxHeight: '96px'
            }}
            onKeyDown={e => {
              // On desktop (lg breakpoint), Enter sends message, Shift+Enter creates new line
              // On mobile/tablet, Enter always creates new line
              if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 1024) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          
          {mentionQuery !== null && (
            <MentionAutocomplete
              users={users.filter(u => !!u.profile_completed)}
              searchQuery={mentionQuery}
              onSelect={handleMentionSelect}
            />
          )}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!message.trim() && attachments.length === 0}
          className="p-2 sm:p-2.5 rounded-button-rect bg-gradient-primary hover:scale-105 text-white font-medium transition-all shadow-soft hover:shadow-soft-lg disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        </button>
      </div>
    </div>
  );
}
