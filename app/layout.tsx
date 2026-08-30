import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/src/lib/auth-hook";
import { ThemeProvider } from "@/src/context/ThemeContext";
import { ToastProvider } from "@/src/context/ToastContext";
import UmamiAnalytics from "@/src/components/UmamiAnalytics";

export const dynamic = 'force-dynamic';

const SITE_URL = "https://nextdoor.deeproduct.org";
const SITE_DESCRIPTION =
  "Next Door is a free, open-source, self-hosted community app for your street, building, or local group: real-time chat, events, and a private marketplace, with no ads, no tracking, and your data staying yours.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Next Door · Open-source, self-hosted neighbourhood app",
    template: "%s · Next Door",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Next Door",
  keywords: [
    "self-hosted community app",
    "open source Nextdoor alternative",
    "neighbourhood chat app",
    "private community app",
    "self-hosted neighbourhood app",
    "Next.js Supabase community app",
  ],
  authors: [{ name: "deeproduct", url: "https://www.deeproduct.org/" }],
  creator: "deeproduct",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  verification: { google: "CDcMa6Gjxy0A-c2Khi0tCZm0PK4K0a94sUYP8FET29w" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Next Door",
    title: "Next Door · Open-source, self-hosted neighbourhood app",
    description: SITE_DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Next Door · Open-source, self-hosted neighbourhood app",
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

const GITHUB_URL = "https://github.com/deepakkrishnar1618-svg/Next-Door-App";

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Next Door",
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "deeproduct",
      url: "https://www.deeproduct.org/",
      logo: `${SITE_URL}/apple-touch-icon.png`,
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Next Door",
      description: SITE_DESCRIPTION,
      applicationCategory: "SocialNetworkingApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      sameAs: [GITHUB_URL],
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
        <UmamiAnalytics />
      </body>
    </html>
  );
}
