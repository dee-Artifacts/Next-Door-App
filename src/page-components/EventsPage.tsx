'use client';
import { useState, useEffect, useRef } from "react";
import { usePolling } from "@/src/hooks/usePolling";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Calendar, Clock, Users, MapPin, Sparkles, Zap, MessageCircle, Trash2, LogOut, Check, X, MoreVertical, History, HelpCircle } from "lucide-react";
import { EventListSkeleton } from "@/src/components/Skeletons";
import { getEventStatus } from "@/src/components/EventStatusBadge";
import EventHistoryPanel from "@/src/components/EventHistoryPanel";
import EventsOnboarding from "@/src/components/EventsOnboarding";
import type { Event } from "@/src/lib/types";

type Tab = "upcoming" | "my-events";

interface EventsPageProps {
  onGoToEventChat?: (eventId: number, eventName: string) => void;
}

export default function EventsPage({ onGoToEventChat }: EventsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams?.get('tab') as Tab) || "upcoming";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  
  // Events state
  const [myEvents, setMyEvents] = useState<Event[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [eventUnreadCounts, setEventUnreadCounts] = useState<Record<number, number>>({});
  
  // Delete confirmation state
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  
  // Leave confirmation state
  const [leavingEventId, setLeavingEventId] = useState<number | null>(null);
  
  // Countdown state
  const [countdowns, setCountdowns] = useState<Record<number, string>>({});
  
  // Menu and history panel state
  const [showMenu, setShowMenu] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside or scroll
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    const handleScroll = () => setShowMenu(false);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [showMenu]);

  useEffect(() => {
    if (activeTab === "my-events") {
      fetchMyEvents();
    } else {
      fetchUpcomingEvents();
    }
  }, [activeTab]);

  // Poll unread counts for My Events tab
  const pollUnreadCounts = activeTab === "my-events" && myEvents.length > 0;
  useEffect(() => {
    if (!pollUnreadCounts) return;
    fetchUnreadCounts(myEvents);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, myEvents]);
  usePolling(() => fetchUnreadCounts(myEvents), 3000, { enabled: pollUnreadCounts });

  // Calculate countdown for expired events
  useEffect(() => {
    const calculateCountdown = (endDatetime: string): string => {
      const endTime = new Date(endDatetime).getTime();
      const gracePeriodEnd = endTime + 24 * 60 * 60 * 1000;
      const now = Date.now();
      const diff = gracePeriodEnd - now;
      if (diff <= 0) return '0h 0m';
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor(diff % (1000 * 60 * 60) / (1000 * 60));
      return `${hours}h ${minutes}m`;
    };

    const updateCountdowns = () => {
      const newCountdowns: Record<number, string> = {};
      [...myEvents, ...upcomingEvents].forEach(event => {
        if (event.is_expired === 1 || event.is_expired === true) {
          newCountdowns[event.id] = calculateCountdown(event.end_datetime);
        }
      });
      setCountdowns(newCountdowns);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 60000);
    return () => clearInterval(interval);
  }, [myEvents, upcomingEvents]);

  const fetchMyEvents = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/events/my", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setMyEvents(Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : []);
      } else {
        setMyEvents([]);
      }
    } catch (error) {
      console.error("Error fetching my events:", error);
      setMyEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUpcomingEvents = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/events", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setUpcomingEvents(Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : []);
      } else {
        setUpcomingEvents([]);
      }
    } catch (error) {
      console.error("Error fetching upcoming events:", error);
      setUpcomingEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUnreadCounts = async (events: Event[]) => {
    const counts: Record<number, number> = {};
    for (const event of events) {
      try {
        const response = await fetch(`/api/events/${event.id}/messages/unread/count`, { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          counts[event.id] = data.count || 0;
        }
      } catch (error) {
        console.error(`Error fetching unread count for event ${event.id}:`, error);
      }
    }
    setEventUnreadCounts(counts);
  };

  const handleJoinEvent = async (eventId: number) => {
    try {
      const response = await fetch(`/api/events/${eventId}/join`, { method: "POST", credentials: "include" });
      if (response.ok) {
        router.push(`/events/${eventId}/chat`);
      } else {
        const err = await response.json();
        alert(err.error || "Failed to join event");
      }
    } catch (error) {
      console.error("Error joining event:", error);
      alert("Failed to join event");
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (deleteConfirmText !== "delete") {
      alert('Type "delete" to confirm deletion');
      return;
    }
    try {
      const response = await fetch(`/api/events/${eventId}`, { method: "DELETE", credentials: "include" });
      if (response.ok) {
        setDeletingEventId(null);
        setDeleteConfirmText("");
        fetchMyEvents();
        fetchUpcomingEvents();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to delete event");
      }
    } catch (error) {
      console.error("Error deleting event:", error);
      alert("Failed to delete event");
    }
  };

  const handleLeaveEvent = async (eventId: number) => {
    try {
      const response = await fetch(`/api/events/${eventId}/leave`, { method: "POST", credentials: "include" });
      if (response.ok) {
        alert("Left event successfully");
        setLeavingEventId(null);
        fetchMyEvents();
        fetchUpcomingEvents();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to leave event");
      }
    } catch (error) {
      console.error("Error leaving event:", error);
      alert("Failed to leave event");
    }
  };

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatEventTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const calculateDuration = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return `${duration} day${duration > 1 ? 's' : ''}`;
  };

  const handleGoToChat = (eventId: number, _eventName: string) => {
    router.push(`/events/${eventId}/chat`);
  };

  const renderEventCard = (event: Event, isMyEvent: boolean = false) => {
    const isExpired = event.is_expired === 1 || event.is_expired === true;
    const status = getEventStatus(event.start_datetime, event.end_datetime);

    return (
      <div
        key={event.id}
        className={`border rounded-2xl overflow-hidden ${
          isExpired
            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-500 dark:border-amber-400'
            : 'bg-slate-50 dark:bg-dark-surface border-slate-200 dark:border-slate-700'
        }`}
      >
        {/* Event Image */}
        {event.image_url && (
          <div className="relative h-40 overflow-hidden">
            <img
              src={event.image_url}
              alt={event.name}
              className={`w-full h-full object-cover ${isExpired ? 'opacity-60 grayscale-[30%]' : ''}`}
            />
            {isExpired && (
              <div className="absolute inset-0 bg-gradient-to-t from-amber-900/60 to-transparent" />
            )}
          </div>
        )}

        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className={`text-xl font-bold font-outfit ${isExpired ? 'text-amber-700 dark:text-amber-300' : 'text-dark-ocean dark:text-white'}`}>
                {event.name}
              </h3>
              {isExpired && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-outfit font-semibold mt-1">
                  ✓ Event Successfully Ended
                </p>
              )}
            </div>
            {isMyEvent && Boolean(event.is_creator) && !isExpired && (
              <span className="px-3 py-1 bg-primary-pine/20 dark:bg-primary-mint/20 text-primary-pine dark:text-primary-mint text-sm font-outfit font-semibold rounded-full">
                Creator
              </span>
            )}
          </div>

        <div className="space-y-2">
          <div className={`flex items-center gap-2 ${isExpired ? 'text-amber-600 dark:text-amber-400' : 'text-primary-pine dark:text-primary-mint'}`}>
            <Calendar className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-outfit">{formatEventDate(event.start_datetime)}</span>
          </div>
          <div className={`flex items-center gap-2 ${isExpired ? 'text-amber-600 dark:text-amber-400' : 'text-primary-pine dark:text-primary-mint'}`}>
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-outfit">
              {formatEventTime(event.start_datetime)} - {formatEventTime(event.end_datetime)} ({calculateDuration(event.start_datetime, event.end_datetime)})
            </span>
          </div>
          {event.location && (
            <div className={`flex items-center gap-2 ${isExpired ? 'text-amber-600 dark:text-amber-400' : 'text-primary-pine dark:text-primary-mint'}`}>
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-outfit truncate">{event.location}</span>
            </div>
          )}
          <div className={`flex items-center gap-2 ${isExpired ? 'text-amber-600 dark:text-amber-400' : 'text-primary-pine dark:text-primary-mint'}`}>
            <Users className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-outfit">{event.current_members} / {event.max_members} members</span>
          </div>
        </div>

        <p className={`text-sm font-outfit ${isExpired ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
          Created by {event.creator_name}
        </p>

        {/* Actions */}
        {isMyEvent ? (
          leavingEventId === event.id ? (
            <div className="space-y-3">
              <p className="text-center text-slate-600 dark:text-slate-400 font-outfit">Are you sure you want to leave?</p>
              <div className="flex items-center gap-2">
                <button onClick={() => handleLeaveEvent(event.id)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-pine/20 dark:bg-primary-mint/20 hover:bg-primary-pine/30 dark:hover:bg-primary-mint/30 text-primary-pine dark:text-primary-mint rounded-full font-outfit font-semibold transition-colors">
                  <Check className="w-5 h-5" /> Yes
                </button>
                <button onClick={() => setLeavingEventId(null)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-error/10 hover:bg-error/20 text-error rounded-full font-outfit font-semibold transition-colors">
                  <X className="w-5 h-5" /> No
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleGoToChat(event.id, event.name)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-button-rect font-outfit font-semibold transition-opacity relative ${
                    isExpired ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-gradient-to-r from-primary-mint to-primary-pine hover:opacity-90 text-white'
                  }`}
                >
                  <MessageCircle className="w-5 h-5" />
                  {isExpired ? 'View Event' : 'Go to Chat'}
                  {eventUnreadCounts[event.id] > 0 && (
                    <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-error text-white text-xs font-bold rounded-full shadow-lg">
                      {eventUnreadCounts[event.id] > 99 ? '99+' : eventUnreadCounts[event.id]}
                    </span>
                  )}
                </button>
                {!isExpired && (
                  Boolean(event.is_creator) ? (
                    <button onClick={() => setDeletingEventId(event.id)} className="p-3 bg-error/10 hover:bg-error/20 text-error rounded-lg transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  ) : (
                    <button onClick={() => setLeavingEventId(event.id)} className="p-3 bg-error/10 hover:bg-error/20 text-error rounded-lg transition-colors">
                      <LogOut className="w-5 h-5" />
                    </button>
                  )
                )}
              </div>
              {renderStatusBanner(status, isExpired, event.id)}
            </div>
          )
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => handleJoinEvent(event.id)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary-mint to-primary-pine hover:opacity-90 text-white rounded-button-rect font-outfit font-semibold transition-opacity"
            >
              Join Event
            </button>
            {renderStatusBanner(status, isExpired, event.id)}
          </div>
        )}
        </div>
      </div>
    );
  };

  const renderStatusBanner = (status: string, isExpired: boolean, eventId: number) => {
    if (!isExpired && status === 'upcoming') {
      return (
        <div className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 dark:from-cyan-500/30 dark:to-teal-500/30 border-2 border-cyan-500 dark:border-cyan-400 rounded-button-rect">
          <Sparkles className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 font-outfit">Upcoming · Hurry up</span>
        </div>
      );
    } else if (!isExpired && status === 'live') {
      return (
        <div className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 dark:from-emerald-500/30 dark:to-emerald-600/30 border-2 border-emerald-500 dark:border-emerald-400 rounded-button-rect">
          <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 font-outfit">Live · Enjoy</span>
        </div>
      );
    } else if (isExpired && countdowns[eventId]) {
      return (
        <div className="w-full flex flex-col items-center gap-1 px-4 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 dark:from-amber-500/30 dark:to-orange-500/30 border-2 border-amber-500 dark:border-amber-400 rounded-button-rect animate-pulse">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 font-outfit">Dissolving in {countdowns[eventId]}</span>
          </div>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-outfit">All messages & attachments will be deleted</span>
        </div>
      );
    }
    return null;
  };

  // Filter out ended events from upcoming
  const filteredUpcomingEvents = upcomingEvents.filter(event => getEventStatus(event.start_datetime, event.end_datetime) !== "ended");

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-light-bg to-slate-100 dark:from-dark-ocean dark:to-dark-ocean">
      {/* Header */}
      <header className="bg-gradient-primary shadow-soft sticky top-0 z-50 shrink-0">
        <div className="max-w-7xl mx-auto px-m py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/chat")}
              className="p-2.5 rounded-button-rect bg-white/20 hover:bg-white/30 text-white transition-all backdrop-blur-sm hover:scale-105"
              title="Back to Chat"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold text-white tracking-tight font-nura">Events</h1>
              <p className="text-xs text-white/90 font-outfit">Party Incoming</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/events/create")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-button-rect bg-white/20 hover:bg-white/30 text-white transition-all backdrop-blur-sm hover:scale-105 font-outfit font-semibold"
              title="Create Event"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Create</span>
            </button>
            
            {/* Kebab Menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2.5 rounded-button-rect bg-white/20 hover:bg-white/30 text-white transition-all backdrop-blur-sm hover:scale-105"
                title="More options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-dark-elevated rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowOnboarding(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
                    >
                      <HelpCircle className="w-5 h-5 text-violet-500" />
                      <span className="font-outfit font-medium">How This Works</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowHistoryPanel(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
                    >
                      <History className="w-5 h-5 text-primary-pine dark:text-primary-mint" />
                      <span className="font-outfit font-medium">Event History</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      
      {/* Main content area with side panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Tabs */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl p-1.5 mb-6 flex">
              <button
                onClick={() => setActiveTab("upcoming")}
                className={`flex-1 py-3 px-4 rounded-xl font-outfit font-medium transition-all ${
                  activeTab === "upcoming"
                    ? "bg-gradient-to-r from-primary-mint to-primary-pine text-white shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-dark-ocean dark:hover:text-white"
                }`}
              >
                Upcoming
              </button>
              <button
                onClick={() => setActiveTab("my-events")}
                className={`flex-1 py-3 px-4 rounded-xl font-outfit font-medium transition-all ${
                  activeTab === "my-events"
                    ? "bg-gradient-to-r from-primary-mint to-primary-pine text-white shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-dark-ocean dark:hover:text-white"
                }`}
              >
                My Events
              </button>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <EventListSkeleton count={6} />
              </div>
            ) : activeTab === "upcoming" ? (
              filteredUpcomingEvents.length === 0 ? (
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-12 text-center">
                  <Calendar className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                  <h3 className="text-lg font-outfit font-semibold text-dark-ocean dark:text-white mb-2">
                    No upcoming events
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 font-outfit mb-4">
                    Be the first to create an event for your neighbors!
                  </p>
                  <button
                    onClick={() => router.push("/events/create")}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-mint to-primary-pine text-white font-outfit font-medium rounded-xl hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-5 h-5" />
                    Create Event
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredUpcomingEvents.map(event => renderEventCard(event, false))}
                </div>
              )
            ) : myEvents.length === 0 ? (
              <div className="bg-white dark:bg-dark-surface rounded-2xl p-12 text-center">
                <Calendar className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-outfit font-semibold text-dark-ocean dark:text-white mb-2">
                  You haven't joined any events
                </h3>
                <p className="text-slate-500 dark:text-slate-400 font-outfit mb-4">
                  Create an event or join one from the Upcoming tab.
                </p>
                <button
                  onClick={() => router.push("/events/create")}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-mint to-primary-pine text-white font-outfit font-medium rounded-xl hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-5 h-5" />
                  Create Event
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {myEvents.map(event => renderEventCard(event, true))}
              </div>
            )}
          </div>
        </div>

        {/* Desktop side panel - inline without overlay */}
        {showHistoryPanel && (
          <div className="hidden lg:block w-96 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-ocean">
            <EventHistoryPanel isOpen={showHistoryPanel} onClose={() => setShowHistoryPanel(false)} />
          </div>
        )}
      </div>

      {/* Mobile side panel overlay */}
      {showHistoryPanel && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-[60]" onClick={() => setShowHistoryPanel(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-96 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <EventHistoryPanel isOpen={showHistoryPanel} onClose={() => setShowHistoryPanel(false)} />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEventId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setDeletingEventId(null); setDeleteConfirmText(""); }}>
          <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold font-outfit text-dark-ocean dark:text-white mb-2">Delete Event</h3>
            <p className="text-slate-600 dark:text-slate-400 font-outfit mb-4">
              This will permanently delete the event, all messages and attachments. Type &quot;delete&quot; to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder='Type "delete" to confirm'
              className="w-full px-4 py-3 bg-transparent border border-red-500 rounded-xl text-dark-ocean dark:text-white placeholder-slate-400 font-outfit focus:outline-none mb-4"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setDeletingEventId(null); setDeleteConfirmText(""); }}
                className="flex-1 px-4 py-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-dark-ocean dark:text-white rounded-xl font-outfit font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteEvent(deletingEventId)}
                disabled={deleteConfirmText !== "delete"}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-outfit font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-5 h-5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Events How This Works Modal */}
      {showOnboarding && (
        <EventsOnboarding onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
