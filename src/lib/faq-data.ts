export interface FAQItem {
  /** Stable analytics slug. Never reuse or reword — renaming splits the
   *  faq-open data in Umami, which cannot merge two values. */
  id: string;
  question: string;
  answer: string;
}

// Shared by the visible FAQ accordion (app/page.tsx) and the FAQPage JSON-LD,
// so the rendered Q&A and the structured data always stay in sync.
export const FAQ_ITEMS: FAQItem[] = [
  {
    id: "deploy-how",
    question: "How do I deploy this app for my neighborhood?",
    answer: "Next Door is easy to set up. You can host it by cloning our repository, starting a free database on Supabase, and deploying the web app on Vercel. We have a simple guide to walk you through it."
  },
  {
    id: "db-requirements",
    question: "What are the database requirements?",
    answer: "The app runs on a Supabase database. We include a schema script that automatically sets up your tables, security rules, and databases in less than a minute."
  },
  {
    id: "google-oauth",
    question: "How does the Google OAuth sign-in work?",
    answer: "We use secure, passwordless logins through Google. The first person to sign in with the admin email gets full control to approve or block other members."
  },
  {
    id: "privacy-protection",
    question: "How does the app protect my privacy?",
    answer: "Next Door is fully private. We do not track your location, read your messages, or sell your personal details. All chats, listings, and event data are stored on your own self-hosted Supabase database."
  },
  {
    id: "external-members",
    question: "Can external people join my neighborhood group?",
    answer: "No. Access is controlled by the community administrator. Only users approved by the admin can sign in and participate, ensuring your neighborhood chat remains private."
  },
  {
    id: "data-storage",
    question: "Where is my uploaded data and files stored?",
    answer: "All uploaded photos, document attachments, and user avatars are stored securely in your private Supabase Storage buckets under strict access control rules."
  },
  {
    id: "running-cost",
    question: "Is there any cost to running this app?",
    answer: "Running Next Door is completely free for most neighborhood groups. It fits entirely within the free tiers of Vercel, Supabase, and Google Cloud."
  }
];
