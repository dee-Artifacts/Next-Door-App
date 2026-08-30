import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { SOCIAL_LINKS } from "@/src/lib/social-links";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch and follow the maker of Next Door across the web — Deeproduct, Deeportfolio, LinkedIn, YouTube, Discord and Instagram.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact · Next Door",
    description:
      "Get in touch and follow the maker of Next Door across the web — Deeproduct, Deeportfolio, LinkedIn, YouTube, Discord and Instagram.",
    url: "/contact",
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col bg-archio-cream text-archio-ink font-inter">
      {/* Header */}
      <header className="border-b border-black/10">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/icon.svg"
              alt="Next Door"
              className="w-8 h-8 rounded-lg group-hover:scale-105 transition-transform duration-200"
            />
            <span className="text-lg font-crimson font-medium tracking-tight text-archio-ink">
              Next Door
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 hover:text-archio-forest transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Back to home</span>
            <span className="sm:hidden">Home</span>
          </Link>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          {/* Intro */}
          <div className="max-w-2xl">
            <p className="font-inter text-xs font-semibold uppercase tracking-[0.2em] text-archio-forest mb-4">
              Get in touch
            </p>
            <h1 className="font-crimson font-light tracking-tight text-archio-ink text-4xl sm:text-5xl leading-[1.1] mb-5">
              Let&apos;s connect
            </h1>
            <p className="text-black/60 text-base sm:text-lg leading-relaxed">
              Next Door is built by an independent maker. Reach out, follow along, or explore
              the other products and work below — I&apos;d love to hear from you.
            </p>
          </div>

          {/* Links grid */}
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mt-10 sm:mt-12">
            {SOCIAL_LINKS.map(({ name, handle, href, accent, Icon }) => (
              <li key={name}>
                {/* Data attributes rather than a track() call: this page is a server
                    component and exports metadata, so an onClick would force it
                    client-side. The tracker reads these off the DOM on click. */}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${name} — ${handle}`}
                  data-umami-event="social-click"
                  data-umami-event-network={name.toLowerCase()}
                  data-umami-event-placement="contact"
                  className="group flex items-center gap-4 rounded-[20px] border border-black/10 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-black/20 hover:shadow-soft"
                >
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: `${accent}14`, color: accent }}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-crimson text-lg font-medium text-archio-ink">
                      {name}
                    </span>
                    <span className="block truncate text-sm text-black/55">{handle}</span>
                  </span>
                  <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-black/30 transition-all duration-200 group-hover:text-archio-forest group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-black/10">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-black/45">
          <p>&copy; {new Date().getFullYear()} Next Door. All rights reserved.</p>
          <Link href="/" className="hover:text-archio-forest transition-colors">
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
}
