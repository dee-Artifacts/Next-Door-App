'use client';
import { useState, useEffect } from "react";
import { usePolling } from "@/src/hooks/usePolling";
import { stopIfDenied } from "@/src/lib/session-guard";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/src/lib/auth-hook";
import { ArrowLeft, Plus, ChevronLeft, ChevronRight, MessageCircle, Users, Hand, Trash2, X, Check, MessageSquarePlus, LogOut, CheckCircle, MoreVertical, History, HelpCircle } from "lucide-react";
import ListingHistoryPanel from "@/src/components/ListingHistoryPanel";
import MarketOnboarding from "@/src/components/MarketOnboarding";
import { getUserAvatar } from "@/src/utils/avatars";

type Tab = "new" | "my-listings";

interface ListingImage {
  image_url: string;
  display_order: number;
}

interface InterestedUser {
  user_id: string;
  name: string;
  avatar_url: string | null;
  room_number: string | null;
}

interface MarketListing {
  id: number;
  title: string;
  description: string;
  type: string;
  transaction_type: string;
  is_free: number;
  price: number | null;
  rental_start_datetime: string | null;
  rental_end_datetime: string | null;
  images: ListingImage[];
  status: string;
  creator_user_id: string;
  creator_name: string;
  creator_avatar: string | null;
  creator_room: string | null;
  interested_count: number;
  is_interested?: number;
  created_at: string;
  is_creator?: number;
  winner_user_id?: string | null;
  winner_name?: string | null;
  winner_avatar?: string | null;
}

function ListingCardSkeleton() {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
      <div className="aspect-[4/3] bg-slate-200 dark:bg-dark-elevated animate-shimmer" />
      <div className="p-4 space-y-3">
        <div className="h-5 w-32 bg-slate-200 dark:bg-dark-elevated rounded animate-shimmer" />
        <div className="space-y-2">
          <div className="h-4 w-full bg-slate-200 dark:bg-dark-elevated rounded animate-shimmer" />
          <div className="h-4 w-2/3 bg-slate-200 dark:bg-dark-elevated rounded animate-shimmer" />
        </div>
        <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-dark-elevated animate-shimmer" />
            <div className="h-3 w-16 bg-slate-200 dark:bg-dark-elevated rounded animate-shimmer" />
          </div>
        </div>
        <div className="h-10 w-full bg-slate-200 dark:bg-dark-elevated rounded-xl animate-shimmer" />
      </div>
    </div>
  );
}

function ListingCard({ listing, onInterestChange, unreadCount = 0 }: { listing: MarketListing; onInterestChange: () => void; unreadCount?: number }) {
  const router = useRouter();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isInterested, setIsInterested] = useState(Boolean(listing.is_interested));
  const [isRegistering, setIsRegistering] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completeConfirmText, setCompleteConfirmText] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [selectedHelpers, setSelectedHelpers] = useState<string[]>([]);
  const [interestedUsers, setInterestedUsers] = useState<InterestedUser[]>([]);
  const [loadingInterested, setLoadingInterested] = useState(false);
  
  const images = listing.images.map(img => img.image_url);
  const isCreator = Boolean(listing.is_creator);
  
  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };
  
  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleRegisterInterest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRegistering) return;
    setIsRegistering(true);
    try {
      const response = await fetch(`/api/market/listings/${listing.id}/interest`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        setIsInterested(true);
        onInterestChange();
        router.push(`/market/${listing.id}/chat`);
      }
    } catch (error) {
      console.error('Failed to register interest:', error);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleGoToChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/market/${listing.id}/chat`);
  };

  const fetchInterestedUsers = async () => {
    setLoadingInterested(true);
    try {
      const response = await fetch(`/api/market/listings/${listing.id}/interested`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setInterestedUsers(data.users || []);
      }
    } catch (error) {
      console.error('Failed to fetch interested users:', error);
    } finally {
      setLoadingInterested(false);
    }
  };

  const handleOpenCompleteModal = () => {
    setShowCompleteConfirm(true);
    fetchInterestedUsers();
  };

  const handleDeleteListing = async () => {
    if (deleteConfirmText !== "delete" || isDeleting) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/market/listings/${listing.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        onInterestChange();
      }
    } catch (error) {
      console.error('Failed to delete listing:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText("");
    }
  };

  const handleLeaveListing = async () => {
    setIsLeaving(true);
    try {
      const response = await fetch(`/api/market/listings/${listing.id}/interest`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        setIsInterested(false);
        setShowLeaveConfirm(false);
        onInterestChange();
      }
    } catch (error) {
      console.error('Failed to leave listing:', error);
    } finally {
      setIsLeaving(false);
    }
  };

  const handleCompleteListing = async () => {
    if (completeConfirmText !== "complete" || isCompleting) return;
    setIsCompleting(true);
    try {
      const response = await fetch(`/api/market/listings/${listing.id}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helper_user_ids: selectedHelpers })
      });
      if (response.ok) {
        onInterestChange();
      }
    } catch (error) {
      console.error('Failed to complete listing:', error);
    } finally {
      setIsCompleting(false);
      setShowCompleteConfirm(false);
      setCompleteConfirmText("");
      setSelectedHelpers([]);
    }
  };

  const timeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-primary-mint/50 dark:hover:border-primary-mint/50 transition-all hover:shadow-lg group relative">
      {/* Image Section */}
      {images.length > 0 && (
        <div className="relative aspect-[4/3] bg-slate-100 dark:bg-dark-elevated overflow-hidden">
          <img 
            src={images[currentImageIndex]} 
            alt={listing.title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
          {/* Image Navigation */}
          {images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {/* Image Dots */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentImageIndex 
                        ? "bg-white w-4" 
                        : "bg-white/50 w-2"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
          
          {/* Creator Badge */}
          {isCreator && (
            <div className="absolute top-2 left-2">
              <span className="px-2 py-0.5 bg-primary-pine/90 text-white text-xs font-medium rounded-full">
                Your Request
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Content Section */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-outfit font-semibold text-dark-ocean dark:text-white line-clamp-1">
            {listing.title}
          </h3>
          <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
            {timeAgo(listing.created_at)}
          </span>
        </div>
        
        {/* Description */}
        <p className="text-sm text-slate-600 dark:text-slate-400 font-outfit line-clamp-2">
          {listing.description}
        </p>
        
        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            {listing.creator_avatar ? (
              <img 
                src={listing.creator_avatar} 
                alt={listing.creator_name || "User"}
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-mint to-primary-pine flex items-center justify-center text-white text-xs font-bold">
                {(listing.creator_name || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400 font-outfit">
              {listing.creator_name || "Unknown"}
              {listing.creator_room && ` · ${listing.creator_room}`}
            </span>
          </div>
          
          {listing.interested_count > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Users className="w-3.5 h-3.5" />
              {listing.interested_count} helping
            </div>
          )}
        </div>
        
        {/* Action Button */}
        {showLeaveConfirm ? (
          <div className="space-y-3">
            <p className="text-center text-slate-600 dark:text-slate-400 font-outfit text-sm">Leave this request?</p>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleLeaveListing}
                disabled={isLeaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-pine/20 dark:bg-primary-mint/20 hover:bg-primary-pine/30 dark:hover:bg-primary-mint/30 text-primary-pine dark:text-primary-mint rounded-full font-outfit font-semibold transition-colors"
              >
                <Check className="w-5 h-5" /> {isLeaving ? "Leaving..." : "Yes"}
              </button>
              <button 
                onClick={() => setShowLeaveConfirm(false)} 
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full font-outfit font-semibold transition-colors"
              >
                <X className="w-5 h-5" /> No
              </button>
            </div>
          </div>
        ) : isCreator || isInterested ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleGoToChat}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 font-outfit font-medium rounded-xl transition-opacity bg-gradient-to-r from-primary-mint to-primary-pine hover:opacity-90 text-white relative"
            >
              <MessageCircle className="w-4 h-4" />
              Chat
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 flex items-center justify-center px-1.5 bg-red-500 text-white text-xs font-bold rounded-full">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {isCreator ? (
              <>
                <button 
                  onClick={handleOpenCompleteModal} 
                  className="p-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg transition-colors"
                >
                  <CheckCircle className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(true)} 
                  className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button 
                onClick={() => setShowLeaveConfirm(true)} 
                className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={handleRegisterInterest}
            disabled={isRegistering}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 font-outfit font-medium rounded-xl transition-opacity bg-gradient-to-r from-primary-mint to-primary-pine hover:opacity-90 text-white disabled:opacity-50"
          >
            <Hand className="w-4 h-4" />
            {isRegistering ? "Joining..." : "I Can Help"}
          </button>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
        >
          <div 
            className="bg-white dark:bg-dark-surface rounded-2xl p-6 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-outfit font-semibold text-dark-ocean dark:text-white">Delete Request?</h3>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-dark-elevated rounded-full"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-outfit mb-4">
              This will permanently delete "{listing.title}" and all messages. This cannot be undone.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 font-outfit mb-2">
              Type "delete" to confirm
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder='Type "delete"'
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-dark-elevated text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm font-outfit mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                className="flex-1 py-2.5 px-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl font-outfit font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteListing}
                disabled={deleteConfirmText !== "delete" || isDeleting}
                className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-outfit font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Confirmation Modal */}
      {showCompleteConfirm && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={(e) => { e.stopPropagation(); setShowCompleteConfirm(false); setCompleteConfirmText(""); setSelectedHelpers([]); }}
        >
          <div 
            className="bg-white dark:bg-dark-surface rounded-3xl w-full max-w-sm shadow-xl animate-scale-in relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-outfit font-semibold text-slate-800 dark:text-white mb-2">Mark as Complete?</h3>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-4">
                We hope your request was fulfilled! 🎉
              </p>
              
              {/* Helped by selection */}
              {(loadingInterested || interestedUsers.length > 0) && (
                <div className="mb-4 text-left">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Helped by (optional):</p>
                  {loadingInterested ? (
                    <div className="text-sm text-slate-500 font-outfit">Loading...</div>
                  ) : interestedUsers.length > 0 ? (
                    <div className="max-h-[140px] overflow-y-auto space-y-2 pr-1">
                      {interestedUsers.map((helperUser) => (
                        <label
                          key={helperUser.user_id}
                          className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${
                            selectedHelpers.includes(helperUser.user_id)
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700'
                              : 'bg-slate-50 dark:bg-dark-elevated border border-transparent hover:bg-slate-100 dark:hover:bg-dark-elevated/80'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedHelpers.includes(helperUser.user_id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedHelpers(prev => [...prev, helperUser.user_id]);
                              } else {
                                setSelectedHelpers(prev => prev.filter(id => id !== helperUser.user_id));
                              }
                            }}
                            className="sr-only"
                          />
                          <img
                            src={getUserAvatar(helperUser.avatar_url || '', helperUser.name)}
                            alt={helperUser.name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{helperUser.name}</p>
                            {helperUser.room_number && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">#{helperUser.room_number}</p>
                            )}
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            selectedHelpers.includes(helperUser.user_id)
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}>
                            {selectedHelpers.includes(helperUser.user_id) && (
                              <CheckCircle className="w-3 h-3 text-white" />
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : null}
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
                  onClick={() => { setShowCompleteConfirm(false); setCompleteConfirmText(""); setSelectedHelpers([]); }}
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
              onClick={() => { setShowCompleteConfirm(false); setCompleteConfirmText(""); setSelectedHelpers([]); }}
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

export default function MarketPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useAuth(); // Ensure user is authenticated
  const initialTab = (searchParams?.get('tab') as Tab) || "new";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    fetchListings();
  }, [activeTab]);

  // Poll unread counts for My Listings tab
  const pollUnreadCounts = activeTab === "my-listings" && listings.length > 0;
  useEffect(() => {
    if (!pollUnreadCounts) return;
    fetchUnreadCounts(listings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, listings]);
  usePolling(() => fetchUnreadCounts(listings), 30_000, { enabled: pollUnreadCounts });

  // One request for every listing's unread count
  const fetchUnreadCounts = async (listingsToFetch: MarketListing[]) => {
    if (listingsToFetch.length === 0) return;
    try {
      const ids = listingsToFetch.map((l) => l.id).join(",");
      const response = await fetch(`/api/listings/unread-counts?ids=${ids}`, { credentials: "include" });
      if (!response.ok) return stopIfDenied(response);
      const data = await response.json();
      setUnreadCounts(data.counts || {});
    } catch (error) {
      console.error("Error fetching listing unread counts:", error);
    }
  };

  const fetchListings = async () => {
    setIsLoading(true);
    try {
      const filter = activeTab === "my-listings" ? "my" : "new";
      const response = await fetch(`/api/market/listings?filter=${filter}`, {
        credentials: "include"
      });
      
      if (response.ok) {
        const data = await response.json();
        setListings(data.listings || []);
      } else {
        console.error("Failed to fetch listings");
        setListings([]);
      }
    } catch (error) {
      console.error("Error fetching listings:", error);
      setListings([]);
    } finally {
      setIsLoading(false);
    }
  };

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
              <h1 className="text-2xl font-extrabold text-white tracking-tight font-nura">Quick Request</h1>
              <p className="text-xs text-white/90 font-outfit">Help yourself</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/market/create")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-button-rect bg-white/20 hover:bg-white/30 text-white transition-all backdrop-blur-sm hover:scale-105 font-outfit font-semibold"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Create</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowKebabMenu(!showKebabMenu)}
                className="p-2.5 rounded-button-rect bg-white/20 hover:bg-white/30 text-white transition-all backdrop-blur-sm hover:scale-105"
                title="More options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {showKebabMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowKebabMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-dark-elevated rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                    <button
                      onClick={() => {
                        setShowOnboarding(true);
                        setShowKebabMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
                    >
                      <HelpCircle className="w-5 h-5 text-amber-500" />
                      <span className="font-outfit font-medium">How This Works</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowHistoryPanel(true);
                        setShowKebabMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
                    >
                      <History className="w-5 h-5 text-primary-pine dark:text-primary-mint" />
                      <span className="font-outfit font-medium">History</span>
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
            onClick={() => setActiveTab("new")}
            className={`flex-1 py-3 px-4 rounded-xl font-outfit font-medium transition-all ${
              activeTab === "new"
                ? "bg-gradient-to-r from-primary-mint to-primary-pine text-white shadow-md"
                : "text-slate-600 dark:text-slate-400 hover:text-dark-ocean dark:hover:text-white"
            }`}
          >
            Neighbor Requests
          </button>
          <button
            onClick={() => setActiveTab("my-listings")}
            className={`flex-1 py-3 px-4 rounded-xl font-outfit font-medium transition-all ${
              activeTab === "my-listings"
                ? "bg-gradient-to-r from-primary-mint to-primary-pine text-white shadow-md"
                : "text-slate-600 dark:text-slate-400 hover:text-dark-ocean dark:hover:text-white"
            }`}
          >
            My Requests
          </button>
        </div>

        {/* Listings Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        ) : listings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} onInterestChange={fetchListings} unreadCount={unreadCounts[listing.id] || 0} />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-dark-surface rounded-2xl p-12 text-center">
            <MessageSquarePlus className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-lg font-outfit font-semibold text-dark-ocean dark:text-white mb-2">
              {activeTab === "new" ? "No requests yet" : "No requests yet"}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 font-outfit mb-4">
              {activeTab === "new" 
                ? "Be the first to ask your neighbors for help!" 
                : "Create a request or help a neighbor to see it here."}
            </p>
            <button
              onClick={() => router.push("/market/create")}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-mint to-primary-pine text-white font-outfit font-medium rounded-xl hover:opacity-90 transition-opacity"
            >
              <Plus className="w-5 h-5" />
              New Request
            </button>
          </div>
        )}
          </div>
        </div>

        {/* Desktop side panel - inline without overlay */}
        {showHistoryPanel && (
          <div className="hidden lg:block w-96 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-ocean">
            <ListingHistoryPanel isOpen={showHistoryPanel} onClose={() => setShowHistoryPanel(false)} />
          </div>
        )}
      </div>

      {/* Mobile side panel overlay */}
      {showHistoryPanel && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-[60]" onClick={() => setShowHistoryPanel(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-96 max-w-[85vw] bg-white dark:bg-dark-ocean shadow-soft-lg dark:shadow-soft-dark animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <ListingHistoryPanel isOpen={showHistoryPanel} onClose={() => setShowHistoryPanel(false)} />
          </div>
        </div>
      )}

      {/* Market How This Works Modal */}
      {showOnboarding && (
        <MarketOnboarding onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
