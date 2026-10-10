import { useEffect, useState } from "react";
import { usePolling } from "@/src/hooks/usePolling";
import { stopIfDenied } from "@/src/lib/session-guard";
import { Bell, MessageCircle, AlertTriangle, Eye, Trash2, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { NotificationsSkeleton } from "@/src/components/Skeletons";

interface Notification {
  id: number;
  type: string;
  message_id: number;
  message_content: string;
  mentioned_by_name: string;
  mentioned_by_avatar: string | null;
  is_read: number;
  created_at: string;
}

interface Reminder {
  id: string;
  type: 'inactive_request' | 'dissolving_event';
  title: string;
  description: string;
  itemId: number;
  createdAt: string;
}

interface AdminReminder {
  id: number;
  message_id: number;
  content: string;
  created_by_user_id: string;
  created_by_name: string;
  expires_at: string;
  created_at: string;
}

interface NotificationPanelProps {
  onClose: () => void;
  onMessageClick: (messageId: number) => void;
  onUnreadClick: () => void;
  unreadMessageCount: number;
  groupId?: string;
}

export default function NotificationPanel({ 
  onClose, 
  onMessageClick, 
  onUnreadClick,
  unreadMessageCount,
  groupId
}: NotificationPanelProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [adminReminders, setAdminReminders] = useState<AdminReminder[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
  // Auto-refresh every 30 seconds to handle expiring reminders
  usePolling(() => fetchData(), 30000);

  const fetchData = async () => {
    try {
      // Fetch notifications, reminders, admin reminders, and admin status in parallel
      const [notificationsRes, remindersRes, adminRemindersRes, meRes] = await Promise.all([
        fetch(groupId 
          ? `/api/notifications?group_id=${encodeURIComponent(groupId)}`
          : "/api/notifications", { credentials: 'include' }),
        fetch("/api/reminders", { credentials: 'include' }),
        fetch("/api/admin-reminders", { credentials: 'include' }),
        fetch("/api/users/me", { credentials: 'include' }),
      ]);

      if (notificationsRes.status === 401 || notificationsRes.status === 403) {
        return stopIfDenied(notificationsRes);
      }

      if (notificationsRes.ok) {
        const notificationsData = await notificationsRes.json();
        setNotifications(notificationsData);
      }

      if (remindersRes.ok) {
        const remindersData = await remindersRes.json();
        setReminders(remindersData.reminders || []);
      }

      if (adminRemindersRes.ok) {
        const adminRemindersData = await adminRemindersRes.json();
        setAdminReminders(adminRemindersData.reminders || []);
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        setIsAdmin(meData.is_admin === 1 || meData.is_admin === true || meData.is_admin === "1");
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (notificationId?: number) => {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          notification_ids: notificationId ? [notificationId] : [],
        }),
      });
      
      if (notificationId) {
        setNotifications(prev => 
          prev.map(n => n.id === notificationId ? { ...n, is_read: 1 } : n)
        );
      } else {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      }
    } catch (error) {
      console.error("Error marking notifications as read:", error);
    }
  };

  const clearNotifications = async () => {
    try {
      await fetch("/api/notifications/clear", {
        method: "DELETE",
        credentials: 'include',
      });
      setNotifications([]);
    } catch (error) {
      console.error("Error clearing notifications:", error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    setNotifications(prev => prev.filter(n => n.id !== notification.id));
    await markAsRead(notification.id);
    
    if (notification.type === 'event') {
      // Navigate to events page
      router.push('/events');
    } else {
      onMessageClick(notification.message_id);
    }
    onClose();
  };

  const handleUnreadClick = () => {
    onUnreadClick();
    // Auto-dismiss after 2s so the scroll completes before panel closes
    setTimeout(onClose, 2000);
  };

  const handleReminderView = (reminder: Reminder) => {
    onClose();
    if (reminder.type === 'inactive_request') {
      // Navigate to market page with My Listings tab active
      router.push('/market?tab=my');
    } else if (reminder.type === 'dissolving_event') {
      // Navigate to events page with My Events tab active
      router.push('/events?tab=my-events');
    }
  };

  const handleAdminReminderClick = (reminder: AdminReminder) => {
    onMessageClick(reminder.message_id);
    onClose();
  };

  const deleteAdminReminder = async (reminderId: number) => {
    try {
      await fetch(`/api/admin-reminders/${reminderId}`, {
        method: "DELETE",
        credentials: 'include',
      });
      setAdminReminders(prev => prev.filter(r => r.id !== reminderId));
    } catch (error) {
      console.error("Error deleting admin reminder:", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    
    if (diffMs <= 0) return "Expired";
    
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m left`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h left`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d left`;
  };

  // Strip @announcement tag from content for display
  const cleanReminderContent = (content: string) => {
    return content.replace(/@announcement\d*/gi, '').trim();
  };

  const now = new Date();
  const activeAdminReminders = adminReminders.filter(a =>
    !a.expires_at || new Date(a.expires_at) > now
  );

  const unreadMentionCount = notifications.filter(n => n.is_read === 0).length;
  const totalNotificationCount = unreadMentionCount + reminders.length + activeAdminReminders.length + (unreadMessageCount > 0 ? 1 : 0);

  return (
    <div className="absolute right-4 top-16 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-dark-surface rounded-card shadow-soft dark:shadow-soft-dark border border-slate-200 dark:border-slate-700 flex flex-col max-h-[600px] z-[70] overflow-hidden animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between px-m py-m border-b border-slate-200 dark:border-slate-700 bg-gradient-primary rounded-t-card">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-white" />
          <h2 className="text-lg font-bold text-white font-nura">Notifications</h2>
          {totalNotificationCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold bg-white text-primary-pine rounded-button font-outfit">
              {totalNotificationCount}
            </span>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <NotificationsSkeleton count={4} />
        ) : adminReminders.length === 0 && reminders.length === 0 && notifications.length === 0 && unreadMessageCount === 0 ? (
          /* All caught up state */
          <div className="py-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-lg font-semibold text-slate-600 dark:text-slate-400 font-outfit">All caught up!</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 font-outfit mt-1">No new notifications</p>
          </div>
        ) : (
          <>
            {/* Unread Messages Section */}
            {unreadMessageCount > 0 && (
              <div className="border-b-2 border-slate-200 dark:border-slate-700">
                <button
                  onClick={handleUnreadClick}
                  className="w-full px-m py-m text-left hover:bg-slate-50 dark:hover:bg-dark-elevated transition-colors bg-blue-50/50 dark:bg-blue-900/20"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-soft">
                      <MessageCircle className="w-5 h-5 text-white" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white font-outfit">
                          {unreadMessageCount} unread {unreadMessageCount === 1 ? 'message' : 'messages'}
                        </p>
                        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 font-outfit">
                        Jump to your last read message
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Announcements Section */}
            <div className="border-b border-slate-200 dark:border-slate-700">
              <div className={`px-m py-3 border-b ${
                activeAdminReminders.length > 0
                  ? 'bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 border-amber-200/50 dark:border-amber-700/30'
                  : 'bg-slate-50 dark:bg-dark-elevated border-slate-100 dark:border-slate-700'
              }`}>
                <div className="flex items-center gap-2">
                  <Bell className={`w-5 h-5 ${activeAdminReminders.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`} />
                  <h3 className={`text-xs font-semibold uppercase tracking-wide font-outfit ${
                    activeAdminReminders.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400'
                  }`}>
                    Announcements ({activeAdminReminders.length})
                  </h3>
                </div>
              </div>
              {activeAdminReminders.length > 0 && (
                <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
                  {activeAdminReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="px-m py-m bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-soft">
                          <Bell className="w-5 h-5 text-white" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400 font-outfit">
                              From {reminder.created_by_name}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-outfit">
                              <Clock className="w-3 h-3" />
                              {formatTimeRemaining(reminder.expires_at)}
                            </div>
                          </div>
                          <p className="text-sm text-slate-800 dark:text-white font-outfit mb-2 line-clamp-2">
                            {cleanReminderContent(reminder.content)}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleAdminReminderClick(reminder)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/40 hover:bg-amber-200 dark:hover:bg-amber-800/60 rounded-full transition-colors font-outfit"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                            {isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteAdminReminder(reminder.id);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-800/40 hover:bg-red-200 dark:hover:bg-red-800/60 rounded-full transition-colors font-outfit"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reminders Section */}
            <div className="border-b border-slate-200 dark:border-slate-700">
              <div className={`px-m py-3 border-b ${
                reminders.length > 0 
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200/50 dark:border-amber-700/30' 
                  : 'bg-slate-50 dark:bg-dark-elevated border-slate-100 dark:border-slate-700'
              }`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-5 h-5 ${reminders.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`} />
                  <h3 className={`text-xs font-semibold uppercase tracking-wide font-outfit ${
                    reminders.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400'
                  }`}>
                    Reminders ({reminders.length})
                  </h3>
                </div>
              </div>
              {reminders.length > 0 && (
                <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
                  {reminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="px-m py-m bg-amber-50/50 dark:bg-amber-900/10"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-soft ${
                          reminder.type === 'inactive_request' 
                            ? 'bg-gradient-to-br from-amber-500 to-orange-600' 
                            : 'bg-gradient-to-br from-slate-500 to-slate-600'
                        }`}>
                          <span className="text-lg">{reminder.type === 'inactive_request' ? '📦' : '📅'}</span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white font-outfit line-clamp-1 mb-0.5">
                            {reminder.title}
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-300 font-outfit mb-2">
                            {reminder.description}
                          </p>
                          <button
                            onClick={() => handleReminderView(reminder)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/40 hover:bg-amber-200 dark:hover:bg-amber-800/60 rounded-full transition-colors font-outfit"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity Section */}
            <div className="border-b border-slate-200 dark:border-slate-700">
              <div className="px-m py-3 bg-slate-50 dark:bg-dark-elevated border-b border-slate-100 dark:border-slate-700">
                <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide font-outfit">
                  Activity ({notifications.length})
                </h3>
              </div>
              {notifications.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {notifications.map((notification) => {
                    const isMarketListing = notification.type === 'market_listing';
                    const isEvent = notification.type === 'event';
                    const isActivity = notification.type === 'activity';
                    const notificationText = isMarketListing
                      ? `${notification.mentioned_by_name} posted a new request`
                      : isEvent
                        ? `${notification.mentioned_by_name} created a new event`
                        : isActivity && notification.message_content
                          ? notification.message_content
                          : `${notification.mentioned_by_name} mentioned you`;
                    
                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full px-m py-m text-left hover:bg-slate-50 dark:hover:bg-dark-elevated transition-colors ${
                          notification.is_read === 0 ? "bg-primary-mint/5 dark:bg-primary-mint/10" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {isMarketListing ? (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white flex-shrink-0 shadow-soft">
                              <span className="text-lg">📦</span>
                            </div>
                          ) : isEvent ? (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white flex-shrink-0 shadow-soft">
                              <span className="text-lg">📅</span>
                            </div>
                          ) : notification.mentioned_by_avatar ? (
                            <img
                              src={notification.mentioned_by_avatar}
                              alt={notification.mentioned_by_name}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-white dark:ring-dark-surface shadow-soft"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-soft">
                              {notification.mentioned_by_name?.[0]?.toUpperCase() || "?"}
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-800 dark:text-white font-outfit">
                                {notificationText}
                              </p>
                              {notification.is_read === 0 && (
                                <div className="w-2 h-2 bg-primary-mint rounded-full flex-shrink-0 mt-1.5" />
                              )}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-1.5 font-outfit">
                              {isEvent ? "Check out the event!" : notification.message_content}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium font-outfit">
                              {formatTime(notification.created_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer with Mark all as read and Clear */}
      {notifications.length > 0 && (
        <div className="px-m py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-dark-elevated flex justify-end gap-4">
          {unreadMentionCount > 0 && (
            <button
              onClick={() => markAsRead()}
              className="text-sm text-primary-mint hover:text-primary-pine font-medium transition-colors font-outfit"
            >
              Mark all as read
            </button>
          )}
          <button
            onClick={clearNotifications}
            className="text-sm text-slate-500 hover:text-red-500 font-medium transition-colors font-outfit"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
