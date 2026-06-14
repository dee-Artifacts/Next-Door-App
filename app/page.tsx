'use client';

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/src/lib/auth-hook";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  ShoppingBag,
  Calendar,
  Shield,
  Lock,
  Server,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowUpRight,
  Users,
  Settings,
  Menu,
  X,
  User,
  Check,
  MapPin
} from "lucide-react";
import { FAQ_ITEMS } from "@/src/lib/faq-data";
import { SOCIAL_LINKS } from "@/src/lib/social-links";

const EXPLORE_MORE_URL = "https://www.deeproduct.org/";
const GITHUB_URL = "https://github.com/deepakkrishnar1618-svg/Next-Door-App";

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

interface FeatureInfo {
  id: string;
  icon: any;
  title: string;
  desc: string;
  bullets: string[];
}

const FEATURES: FeatureInfo[] = [
  {
    id: "chat",
    icon: MessageSquare,
    title: "Group Chats & Threads",
    desc: "Communicate with your neighbours in a modern chat room with emoji reactions, threaded replies, file and image attachments, and live read receipts.",
    bullets: ["Real-time online status", "Pinned admin announcements", "Full-text message search"]
  },
  {
    id: "events",
    icon: Calendar,
    title: "Neighbourhood Events",
    desc: "Create block parties, meetings, or clean-ups. Residents RSVP with capacity limits, and every event gets its own temporary chat room for planning.",
    bullets: ["Capacity limits per event", "A chat room for each event", "Automatic past-event archive"]
  },
  {
    id: "marketplace",
    icon: ShoppingBag,
    title: "Local Marketplace",
    desc: "A secure marketplace just for your building or street. List items as Sale, Rent, or Free. Interested neighbours queue up and you pick a buyer privately.",
    bullets: ["Rent, Sale & Free listings", "Private 1-on-1 offer chats", "Transaction timeline"]
  },
  {
    id: "admin",
    icon: Settings,
    title: "Admin Moderation Tools",
    desc: "Community leads keep things safe. Activate or suspend members, clear chat history, export a member directory, and configure automated email digests.",
    bullets: ["Member activation control", "Weekly email digests", "CSV member exports"]
  },
  {
    id: "profile",
    icon: Users,
    title: "Rich Member Profiles",
    desc: "Each member adds their room or house number and display name. See neighbourhood activity, real-time online indicators, and short bios.",
    bullets: ["Apartment & house numbers", "Real-time online indicators", "Short member bios"]
  }
];

const CAPABILITIES: string[] = [
  "Real-time chat", "Emoji reactions", "Threaded replies", "Read receipts",
  "Online status", "Pinned announcements", "Event RSVPs", "Capacity limits",
  "Per-event chat rooms", "Marketplace listings", "Rent · Sale · Free", "Private offer chats",
  "CSV member export", "Email digests", "Admin moderation", "Self-hosted"
];

interface Step {
  n: string;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  {
    n: "1",
    title: "Clone & connect Supabase",
    desc: "Fork the repo and spin up a free Supabase project. Our schema script sets up every table, security rule, and storage bucket in under a minute."
  },
  {
    n: "2",
    title: "Deploy on Vercel",
    desc: "Add your environment variables and deploy. Next Door runs comfortably within the Vercel, Supabase, and Google Cloud free tiers."
  },
  {
    n: "3",
    title: "Invite your neighbours",
    desc: "The first admin approves members by email. Only approved residents can sign in, so your street stays genuinely private."
  }
];

interface CompareRow {
  label: string;
  social: boolean;
}

const COMPARISON: CompareRow[] = [
  { label: "Private by default", social: false },
  { label: "No ads or tracking", social: false },
  { label: "You own all the data", social: false },
  { label: "Admin-approved members only", social: false },
  { label: "Self-hosted on your own infra", social: false },
  { label: "Real-time chat & marketplace", social: true }
];

interface PrivacyPoint {
  icon: any;
  title: string;
  desc: string;
}

const PRIVACY_POINTS: PrivacyPoint[] = [
  {
    icon: Lock,
    title: "Passwordless OAuth",
    desc: "Sign in instantly with Google, with no new passwords to remember. Secure sessions, gated by local admin approval before any data is accessible."
  },
  {
    icon: Server,
    title: "100% self-hosted",
    desc: "Run Next Door on your own Vercel and Supabase. Query data directly, migrate it freely, and retain total data sovereignty."
  },
  {
    icon: Shield,
    title: "No ads or algorithms",
    desc: "Zero feeds, recommendation filters, or commercial tracking. Cookies hold your session and nothing more, with no analytics or profiling."
  },
  {
    icon: Settings,
    title: "Strict admin moderation",
    desc: "Admins approve new accounts, suspend users, clear channels, and generate legal data exports, keeping safety standards absolute."
  }
];

const TRUST_BADGES = ["100% self-hosted", "Passwordless OAuth", "No trackers", "Admin moderated"];

const GoogleGlyph = ({ className = "" }: { className?: string }) => (
  <svg className={`h-[18px] w-[18px] shrink-0 ${className}`} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.51 0-6.357-2.89-6.357-6.457 0-3.568 2.848-6.458 6.357-6.458 1.614 0 3.08.575 4.22 1.517l3.245-3.245C19.24 1.935 15.93 1 12.24 1 5.922 1 1 5.973 1 12.114c0 6.14 4.922 11.115 11.24 11.115 6.458 0 11.24-4.514 11.24-11.115 0-.749-.075-1.425-.225-2.071H12.24z" />
  </svg>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="font-inter text-xs font-semibold uppercase tracking-[0.2em] text-archio-forest mb-4">{children}</p>
);

function CtaPair({
  onGuest,
  onGoogle,
  variant = "light",
  className = ""
}: {
  onGuest: () => void;
  onGoogle: () => void;
  variant?: "light" | "forest";
  className?: string;
}) {
  const guest =
    variant === "forest"
      ? "border border-white/25 text-white hover:bg-white/10"
      : "border border-black/15 text-archio-ink hover:bg-black/5";
  const google =
    variant === "forest"
      ? "bg-white text-archio-forest hover:bg-archio-cream"
      : "bg-archio-forest text-white hover:bg-archio-forest-dark";
  const base =
    "w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium font-inter transition-colors";
  return (
    <div className={`flex flex-col-reverse sm:flex-row items-center gap-3 w-full sm:w-auto ${className}`}>
      <button onClick={onGuest} className={`${base} ${guest}`}>
        <User className="w-[18px] h-[18px] shrink-0" />
        <span>Guest Access</span>
      </button>
      <button onClick={onGoogle} className={`${base} ${google}`}>
        <GoogleGlyph />
        <span>Sign in with Google</span>
      </button>
    </div>
  );
}

export default function HomePage() {
  const { user, isPending, redirectToLogin, redirectToGuestLogin } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Component states
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signInMenuOpen, setSignInMenuOpen] = useState(false);
  const signInMenuRef = useRef<HTMLDivElement>(null);

  // Close the Sign In dropdown on outside click
  useEffect(() => {
    if (!signInMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (signInMenuRef.current && !signInMenuRef.current.contains(e.target as Node)) {
        setSignInMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [signInMenuOpen]);

  // Handle Supabase manual code forwarding
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      router.replace(`/auth/callback?code=${encodeURIComponent(code)}`);
    }
  }, [searchParams, router]);

  // Handle redirect if user is logged in
  useEffect(() => {
    if (!isPending && user) {
      fetch("/api/profile", { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data) return;
          if (data.profile_completed) router.push("/chat");
          else router.push("/profile/setup");
        })
        .catch(() => {});
    }
  }, [user, isPending, router]);

  // Track scrolling to change navbar background
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (isPending) {
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
        <div className="min-h-screen bg-archio-cream flex items-center justify-center">
          <div className="text-archio-forest text-lg font-inter animate-pulse-slow">Loading…</div>
        </div>
      </>
    );
  }

  const toggleFaq = (index: number) => setActiveFaq(activeFaq === index ? null : index);
  const goGuest = () => redirectToGuestLogin();
  const goGoogle = () => redirectToLogin();

  return (
    <div className="min-h-screen bg-archio-cream text-archio-ink font-inter antialiased selection:bg-archio-forest selection:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />

      {/* 1. Top utility bar */}
      <div className="w-full border-b border-black/10 bg-archio-cream relative z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-archio-forest/10 text-archio-forest px-2.5 py-0.5 font-semibold uppercase tracking-wider text-[10px] shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-archio-forest opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-archio-forest" />
              </span>
              Demo
            </span>
            <span className="hidden sm:inline text-black/55 truncate">Live demonstration · data resets periodically</span>
          </div>
          <div className="flex items-center gap-4 text-black/55 shrink-0">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-archio-forest transition-colors">GitHub</a>
            <a href={EXPLORE_MORE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-archio-forest transition-colors inline-flex items-center gap-1">
              <span className="hidden sm:inline">Explore more</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
        </div>
      </div>

      {/* 2. Navigation header */}
      <header className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        scrolled ? "bg-archio-cream/90 backdrop-blur-md border-b border-black/10 py-3" : "bg-transparent py-5"
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <a href="#hero" className="flex items-center gap-3 group">
            <img src="/icon.svg" className="w-9 h-9 rounded-xl group-hover:scale-105 transition-transform duration-200" alt="Next Door" />
            <div className="leading-tight">
              <span className="text-xl font-crimson font-medium tracking-tight text-archio-ink block">Next Door</span>
              <span className="text-[10px] text-archio-forest/70 uppercase tracking-[0.18em] font-semibold block -mt-0.5">Neighbourhood Chat</span>
            </div>
          </a>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-black/65">
            <a href="#features" className="hover:text-archio-forest transition-colors">Features</a>
            <a href="#how" className="hover:text-archio-forest transition-colors">How it works</a>
            <a href="#security" className="hover:text-archio-forest transition-colors">Privacy</a>
            <a href="#faq" className="hover:text-archio-forest transition-colors">FAQ</a>
          </nav>

          <div className="hidden md:flex items-center">
            <div className="relative" ref={signInMenuRef}>
              <button
                onClick={() => setSignInMenuOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={signInMenuOpen}
                className="bg-archio-forest hover:bg-archio-forest-dark text-white font-medium py-2.5 pl-5 pr-4 rounded-full transition-colors text-sm flex items-center justify-center gap-2"
              >
                <span>Sign In</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${signInMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {signInMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-black/10 rounded-2xl shadow-2xl p-2 z-50 animate-in flex flex-col gap-1.5">
                  <button
                    onClick={() => { setSignInMenuOpen(false); goGoogle(); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white bg-archio-forest hover:bg-archio-forest-dark transition-colors"
                  >
                    <GoogleGlyph />
                    <span>Sign in with Google</span>
                  </button>
                  <button
                    onClick={() => { setSignInMenuOpen(false); goGuest(); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-archio-ink bg-transparent hover:bg-black/5 border border-black/10 transition-colors"
                  >
                    <User className="w-[18px] h-[18px] shrink-0" />
                    <span>Guest Access</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-archio-ink/70 hover:text-archio-ink p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile nav drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-archio-cream border-b border-black/10 px-6 py-8 flex flex-col gap-6 shadow-xl animate-in">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-lg text-black/70 hover:text-archio-forest transition-colors">Features</a>
            <a href="#how" onClick={() => setMobileMenuOpen(false)} className="text-lg text-black/70 hover:text-archio-forest transition-colors">How it works</a>
            <a href="#security" onClick={() => setMobileMenuOpen(false)} className="text-lg text-black/70 hover:text-archio-forest transition-colors">Privacy</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="text-lg text-black/70 hover:text-archio-forest transition-colors">FAQ</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-lg text-black/70 hover:text-archio-forest transition-colors">GitHub Repository</a>
            <hr className="border-black/10" />
            <CtaPair onGuest={goGuest} onGoogle={goGoogle} variant="light" className="!flex-col" />
          </div>
        )}
      </header>

      {/* 3. Hero */}
      <section id="hero" className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 pb-16 md:pb-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left: copy & CTAs */}
          <div className="flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-archio-forest/20 bg-archio-forest/5 text-archio-forest font-medium text-xs py-1.5 px-3.5 mb-7">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="uppercase tracking-wider text-[11px] font-semibold">Private · self-hosted · yours</span>
            </div>

            <h1 className="font-crimson font-light tracking-tight leading-[1.05] text-archio-ink text-4xl sm:text-5xl lg:text-[3.8rem] mb-6">
              Welcome to your friendly <span className="italic text-archio-forest">neighbourhood</span>
            </h1>

            <p className="text-black/65 text-lg leading-relaxed max-w-xl mb-9">
              Connect with your apartment building, street, or local group. Chat in real time, organise events, and buy, sell, or rent items, all in one secure, private place.
            </p>

            <CtaPair onGuest={goGuest} onGoogle={goGoogle} variant="light" />

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-black/55">
              <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-archio-forest shrink-0" /> Private by default</span>
              <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-archio-forest shrink-0" /> No ads or tracking</span>
              <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-archio-forest shrink-0" /> Open source</span>
            </div>
          </div>

          {/* Right: app-window mockup */}
          <div className="relative w-full max-w-md mx-auto lg:max-w-none lg:mx-0">
            <div className="absolute -inset-6 bg-gradient-to-tr from-archio-forest/15 via-archio-forest/5 to-transparent rounded-[2.5rem] blur-3xl pointer-events-none" />

            <div className="relative animate-float rounded-2xl border border-black/10 bg-white shadow-2xl overflow-hidden">
              {/* Window title bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-black/10 bg-archio-sand/60">
                <span className="w-3 h-3 rounded-full bg-[#FF5A5F]/70" />
                <span className="w-3 h-3 rounded-full bg-[#F4D35E]/80" />
                <span className="w-3 h-3 rounded-full bg-archio-forest/60" />
                <div className="flex items-center gap-2 ml-3 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-archio-forest flex items-center justify-center text-[10px] font-bold text-white shrink-0">N</div>
                  <div className="leading-tight min-w-0">
                    <p className="text-xs font-semibold text-archio-ink truncate">Maple Street</p>
                    <p className="text-[10px] text-archio-forest truncate">Neighbourhood hub</p>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-[10px] text-black/50 shrink-0">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-archio-forest opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-archio-forest" />
                  </span>
                  <span>3 online</span>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex items-center gap-1.5 px-3 pt-3">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-black/50 px-2.5 py-1.5 rounded-lg">
                  <MessageSquare className="w-3.5 h-3.5" /> Chat
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-archio-forest bg-archio-forest/10 border border-archio-forest/20 px-2.5 py-1.5 rounded-lg">
                  <Calendar className="w-3.5 h-3.5" /> Events
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-black/50 px-2.5 py-1.5 rounded-lg">
                  <ShoppingBag className="w-3.5 h-3.5" /> Market
                </span>
              </div>

              {/* Body */}
              <div className="p-4 sm:p-5 flex flex-col gap-3 min-h-[300px]">
                {/* Event card */}
                <div className="animate-fade-up rounded-xl border border-black/10 bg-archio-cream overflow-hidden" style={{ animationDelay: '300ms' }}>
                  <div className="h-16 bg-gradient-to-br from-archio-forest/20 via-archio-forest/10 to-transparent relative flex items-end px-3 py-2">
                    <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider bg-archio-forest text-white px-2 py-0.5 rounded-full">Event</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-archio-ink/80 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-archio-forest shrink-0" />
                      Sat, 14 Jun · 4:00 PM
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-bold text-archio-ink">Summer Street Block Party 🎉</p>
                    <div className="flex items-center justify-between mt-2.5">
                      <div className="flex items-center -space-x-2">
                        {['bg-archio-forest', 'bg-amber-400', 'bg-teal-500'].map((c, i) => (
                          <span key={i} className={`w-6 h-6 rounded-full ${c} border-2 border-archio-cream`} />
                        ))}
                        <span className="w-6 h-6 rounded-full bg-white border-2 border-archio-cream flex items-center justify-center text-[8px] font-bold text-black/50">+12</span>
                      </div>
                      <span className="text-[10px] font-bold text-white bg-archio-forest px-3 py-1 rounded-full flex items-center gap-1">
                        Going <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Marketplace card */}
                <div className="animate-fade-up rounded-xl border border-black/10 bg-archio-cream p-3 flex items-center gap-3" style={{ animationDelay: '1100ms' }}>
                  <div className="w-14 h-14 rounded-lg bg-archio-sand flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-6 h-6 text-archio-forest" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-archio-ink truncate">Cannondale Bike</p>
                      <span className="text-[9px] font-bold uppercase bg-archio-forest/10 text-archio-forest px-1.5 py-0.5 rounded shrink-0">For Sale</span>
                    </div>
                    <p className="text-[11px] text-black/50 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" /> Great condition · 2 streets away
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-sm font-extrabold text-archio-forest">£120</span>
                      <span className="text-[10px] text-black/50">3 interested</span>
                    </div>
                  </div>
                </div>

                {/* Chat bubble */}
                <div className="animate-fade-up flex items-end gap-2.5" style={{ animationDelay: '1900ms' }}>
                  <div className="w-7 h-7 rounded-full bg-archio-forest flex items-center justify-center text-[10px] font-bold text-white shrink-0">A</div>
                  <div className="bg-archio-sand border border-black/5 rounded-2xl rounded-bl-sm px-3.5 py-2 text-xs text-archio-ink max-w-[80%]">
                    Selling my bike too, just added it to the marketplace! 🚲
                  </div>
                </div>
              </div>

              {/* Composer */}
              <div className="px-4 py-3 border-t border-black/10 bg-archio-sand/40 flex items-center gap-2">
                <div className="flex-1 h-9 rounded-full bg-white border border-black/10 px-4 flex items-center text-xs text-black/40 truncate">
                  Post an event or listing…
                </div>
                <div className="w-9 h-9 rounded-full bg-archio-forest flex items-center justify-center shrink-0">
                  <ArrowRight className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 4. Features */}
      <section id="features" className="relative py-20 md:py-28 border-t border-black/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-14">
            <Eyebrow>What&apos;s inside</Eyebrow>
            <h2 className="font-crimson font-light tracking-tight text-archio-ink text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4">
              Everything your community needs
            </h2>
            <p className="text-black/60 text-lg leading-relaxed">
              Next Door brings group chats, local events, and transactions into one secure platform, without ever tracking you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feat) => {
              const FeatIcon = feat.icon;
              return (
                <div
                  key={feat.id}
                  className="bg-white border border-black/10 rounded-2xl p-7 hover:border-archio-forest/30 transition-colors group"
                >
                  <div className="w-12 h-12 bg-archio-forest/8 border border-archio-forest/15 rounded-xl flex items-center justify-center mb-6 group-hover:bg-archio-forest/15 transition-colors">
                    <FeatIcon className="w-6 h-6 text-archio-forest" />
                  </div>
                  <h3 className="text-xl font-crimson font-medium text-archio-ink mb-3">{feat.title}</h3>
                  <p className="text-black/60 text-sm leading-relaxed mb-6">{feat.desc}</p>
                  <ul className="space-y-2 text-xs text-black/70">
                    {feat.bullets.map((bullet, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-archio-forest shrink-0" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {/* CTA tile to balance the 5-card grid */}
            <div className="bg-archio-forest text-white rounded-2xl p-7 flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-crimson font-medium mb-3">Ready to look around?</h3>
                <p className="text-white/70 text-sm leading-relaxed mb-6">
                  Jump straight into the live demo. No account required for guest access.
                </p>
              </div>
              <CtaPair onGuest={goGuest} onGoogle={goGoogle} variant="forest" className="!flex-col !items-stretch" />
            </div>
          </div>

          {/* Capability marquee */}
          <div className="mt-14 relative overflow-hidden border-y border-black/10 py-4">
            <div className="flex gap-3 w-max animate-marquee">
              {[...CAPABILITIES, ...CAPABILITIES].map((tag, i) => (
                <span key={i} className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black/65 whitespace-nowrap">
                  {tag}
                </span>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-archio-cream to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-archio-cream to-transparent" />
          </div>
        </div>
      </section>

      {/* 5. How it works */}
      <section id="how" className="py-20 md:py-28 bg-archio-sand/50 border-t border-black/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-14">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="font-crimson font-light tracking-tight text-archio-ink text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4">
              Deploy in three steps
            </h2>
            <p className="text-black/60 text-lg leading-relaxed">
              Stand up a private community for your street in an afternoon, with no servers to manage and no fees to pay.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div key={step.n} className="bg-white border border-black/10 rounded-2xl p-8">
                <span className="font-crimson font-light text-5xl text-archio-forest block mb-5">{step.n}</span>
                <h4 className="text-lg font-crimson font-medium text-archio-ink mb-3">{step.title}</h4>
                <p className="text-black/60 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Comparison table */}
      <section className="py-20 md:py-28 border-t border-black/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <Eyebrow>The difference</Eyebrow>
            <h2 className="font-crimson font-light tracking-tight text-archio-ink text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4">
              Why Next Door over big social apps?
            </h2>
            <p className="text-black/60 text-lg leading-relaxed">
              The same everyday tools your neighbourhood needs, without the ads, tracking, or feeds.
            </p>
          </div>

          <div className="max-w-3xl mx-auto rounded-3xl border border-black/10 bg-white overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[1.5fr_1fr_1fr]">
              <div className="p-4 sm:p-5" />
              <div className="p-4 sm:p-5 text-center text-sm font-medium text-black/55">Big social apps</div>
              <div className="p-4 sm:p-5 text-center text-sm font-semibold text-white bg-archio-forest rounded-t-2xl">Next Door</div>
            </div>
            {COMPARISON.map((row, i) => (
              <div key={i} className="grid grid-cols-[1.5fr_1fr_1fr] border-t border-black/10">
                <div className="p-4 sm:p-5 text-sm text-archio-ink flex items-center">{row.label}</div>
                <div className="p-4 sm:p-5 flex items-center justify-center">
                  {row.social
                    ? <Check className="w-5 h-5 text-archio-forest" />
                    : <X className="w-5 h-5 text-black/25" />}
                </div>
                <div className={`p-4 sm:p-5 flex items-center justify-center bg-archio-forest ${i === COMPARISON.length - 1 ? "rounded-b-2xl" : ""}`}>
                  <Check className="w-5 h-5 text-white" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Privacy & Security (forest band) */}
      <section id="security" className="py-20 md:py-28 bg-archio-forest text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5">
              <p className="font-inter text-xs font-semibold uppercase tracking-[0.2em] text-archio-cream/70 mb-4">Privacy first</p>
              <h2 className="font-crimson font-light tracking-tight text-white text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-6">
                Your community data belongs to your community
              </h2>
              <p className="text-white/70 leading-relaxed mb-8">
                Unlike public social networks, Next Door is self-hosted and private. You keep full control of your messages, events, and emails, completely free from ads and trackers.
              </p>

              <CtaPair onGuest={goGuest} onGoogle={goGoogle} variant="forest" />

              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3">
                {TRUST_BADGES.map((badge) => (
                  <span key={badge} className="inline-flex items-center gap-2 text-sm text-white/80">
                    <Check className="w-4 h-4 text-white shrink-0" /> {badge}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {PRIVACY_POINTS.map((point) => {
                const PointIcon = point.icon;
                return (
                  <div key={point.title} className="bg-white/[0.05] border border-white/10 p-6 rounded-2xl">
                    <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center mb-4">
                      <PointIcon className="w-5 h-5 text-white" />
                    </div>
                    <h4 className="text-lg font-crimson font-medium text-white mb-2">{point.title}</h4>
                    <p className="text-white/65 text-sm leading-relaxed">{point.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 8. FAQ */}
      <section id="faq" className="py-20 md:py-28 border-t border-black/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
            {/* Left: quote / intro */}
            <div className="lg:col-span-5">
              <Eyebrow>Questions</Eyebrow>
              <h2 className="font-crimson font-light tracking-tight text-archio-ink text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-6">
                Your questions, answered
              </h2>
              <div className="bg-archio-sand border border-black/10 rounded-3xl p-8">
                <p className="font-crimson font-light text-2xl text-archio-ink leading-snug mb-6">
                  “Private, self-hosted, and entirely yours, the way a neighbourhood should be.”
                </p>
                <div className="flex items-center gap-3 mb-7">
                  <img src="/icon.svg" className="w-9 h-9 rounded-lg" alt="Next Door" />
                  <div className="leading-tight">
                    <p className="text-sm font-semibold text-archio-ink">The Next Door project</p>
                    <p className="text-xs text-black/55">Open source · self-hostable</p>
                  </div>
                </div>
                <CtaPair onGuest={goGuest} onGoogle={goGoogle} variant="light" className="!flex-col !items-stretch" />
              </div>
            </div>

            {/* Right: accordion */}
            <div className="lg:col-span-7 space-y-3">
              {FAQ_ITEMS.map((item, idx) => (
                <div key={idx} className="bg-white border border-black/10 rounded-2xl overflow-hidden transition-colors hover:border-archio-forest/25">
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none gap-4"
                  >
                    <span className="font-medium text-archio-ink text-base">{item.question}</span>
                    {activeFaq === idx
                      ? <ChevronUp className="w-5 h-5 text-archio-forest shrink-0" />
                      : <ChevronDown className="w-5 h-5 text-black/40 shrink-0" />}
                  </button>
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${activeFaq === idx ? "max-h-60 border-t border-black/10" : "max-h-0"}`}>
                    <p className="px-6 py-5 text-sm text-black/65 leading-relaxed">{item.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 9. Closing CTA + Explore more */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Closing CTA */}
          <div className="rounded-[28px] bg-archio-sand border border-black/10 p-10 md:p-14 text-center">
            <h2 className="font-crimson font-light tracking-tight text-archio-ink text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4">
              Ready to explore your neighbourhood?
            </h2>
            <p className="text-black/60 text-lg max-w-xl mx-auto mb-8">
              Try the live demo now. Sign in with Google, or jump in instantly as a guest.
            </p>
            <CtaPair onGuest={goGuest} onGoogle={goGoogle} variant="light" className="justify-center" />
            <p className="text-xs text-black/45 mt-5">This is a live demo · data resets periodically.</p>
          </div>

          {/* Explore more products */}
          <div className="bg-archio-forest text-white rounded-[28px] p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <p className="text-xs uppercase font-semibold tracking-[0.2em] text-archio-cream/70 mb-3">More from us</p>
              <h3 className="text-2xl sm:text-3xl font-crimson font-medium mb-3">Explore more products</h3>
              <p className="text-white/70 leading-relaxed max-w-2xl">
                Next Door is part of a wider family of focused tools built to make your digital life calmer and more organised. Take a look at what else we&apos;re building.
              </p>
            </div>
            <a
              href={EXPLORE_MORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full md:w-auto shrink-0 inline-flex items-center justify-center gap-2 bg-white text-archio-forest hover:bg-archio-cream font-medium py-3.5 px-7 rounded-full transition-colors whitespace-nowrap"
            >
              <span>Explore more products</span>
              <ArrowUpRight className="w-4 h-4 shrink-0" />
            </a>
          </div>
        </div>
      </section>

      {/* 10. Footer */}
      <footer className="bg-archio-forest text-white border-t border-white/10 pt-16 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 pb-12 border-b border-white/10">
            <div className="max-w-sm">
              <div className="flex items-center gap-3 mb-4">
                <img src="/icon.svg" className="w-9 h-9 rounded-lg" alt="Next Door" />
                <span className="text-2xl font-crimson font-medium text-white">Next Door</span>
              </div>
              <p className="text-white/65 text-sm leading-relaxed">
                A private, self-hosted hub for your street, block, or building. Chat, events, and a local marketplace in one place.
              </p>
              <div className="flex flex-wrap items-center gap-2.5 mt-6">
                {SOCIAL_LINKS.map(({ name, href, Icon }) => (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={name}
                    title={name}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white/75 hover:bg-white/20 hover:text-white transition-colors"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                ))}
              </div>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/75">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#how" className="hover:text-white transition-colors">How it works</a>
              <a href="#security" className="hover:text-white transition-colors">Privacy</a>
              <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
              <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            </nav>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 text-xs text-white/55">
            <p>&copy; {new Date().getFullYear()} Next Door. All rights reserved.</p>
            <div className="flex flex-wrap justify-center gap-6">
              <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Terms of Service</Link>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub Repo</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
