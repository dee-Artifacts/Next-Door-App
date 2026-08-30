'use client';
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-ocean">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-dark-surface/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link 
            href="/" 
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-elevated transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </Link>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-white">
            Cookie Policy
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              What Are Cookies?
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Cookies are small text files that are stored on your device when you visit a website or use an application. They help websites remember information about your visit, making your next visit easier and the site more useful to you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              Essential Cookies We Use
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Next Door uses only essential cookies that are strictly necessary for the application to function. We do not use any tracking, advertising, or analytics cookies. We do measure basic, anonymous site usage without cookies &mdash; see <span className="font-medium">Analytics Without Cookies</span> below.
            </p>
            
            <div className="bg-slate-50 dark:bg-dark-surface rounded-xl p-6 space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
                <h3 className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Authentication Cookies
                </h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  These cookies are used to verify your identity after you sign in with Google. They ensure that only you can access your account and keep you logged in as you navigate through the app, including community chat, events, and quick requests.
                </p>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  <strong>Duration:</strong> Until you log out or close your browser
                </div>
              </div>

              <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
                <h3 className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Session Cookies
                </h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  These cookies maintain your login session so you don't have to sign in again each time you visit the app. They securely store a session identifier that links to your account and enables features like read receipts and online status.
                </p>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  <strong>Duration:</strong> 30 days (refreshed when you use the app)
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Preference Cookies
                </h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  These cookies remember your preferences, such as your dark/light mode setting (toggled from your profile page) and your cookie consent acknowledgment during account setup.
                </p>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  <strong>Duration:</strong> Persistent (until you clear browser data)
                </div>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              Local Storage
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              In addition to cookies, we use browser local storage to enhance your experience:
            </p>
            <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
              <li><strong>Theme preference:</strong> Your dark/light mode selection</li>
              <li><strong>Onboarding status:</strong> Whether you've seen the "How This Works" guides for community chat, events, and quick requests</li>
              <li><strong>Draft messages:</strong> Temporarily saved message drafts (cleared when sent)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              Why Are These Cookies Necessary?
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Without these essential cookies, Next Door cannot function properly:
            </p>
            <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
              <li>You would not be able to sign in to your account</li>
              <li>You would be logged out every time you navigate to a new page</li>
              <li>Your preference settings (like dark mode) would not be remembered</li>
              <li>The app would not be able to verify you are a community member</li>
              <li>Features like read receipts and typing indicators would not work</li>
              <li>You would not receive proper notifications for messages, events, and requests</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              What We Don't Do
            </h2>
            <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
              <li>We do not use cookies for advertising or marketing</li>
              <li>We do not track your browsing activity across other websites</li>
              <li>We do not share cookie data with third parties for their own purposes</li>
              <li>We do not use cookies to build a profile of your interests</li>
              <li>We do not use analytics cookies to monitor user behavior patterns</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              Analytics Without Cookies
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              We use <span className="font-medium">Umami</span>, a privacy-focused analytics tool, to understand how the public site is used &mdash; for example which pages are opened and which links are clicked. Umami is self-hosted on infrastructure we control, so this data is never sold, shared, or handed to an advertising network.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              This is why it does not require your consent under cookie law:
            </p>
            <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
              <li>It sets <span className="font-medium">no cookies</span> and stores nothing on your device</li>
              <li>It does not collect or store any personal data, and never records your name, email, or account ID</li>
              <li>It does not fingerprint you or follow you across other websites</li>
              <li>It records anonymous, aggregated counts only &mdash; page views and a small number of link clicks, such as which of our social links people follow</li>
              <li>It records only which page was opened, never what is on it &mdash; no message, listing, event, or profile content is ever collected</li>
              <li>Where a web address contains an account or item identifier, that identifier is stripped out before anything is recorded</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              Third-Party Cookies
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              When you sign in using Google, Google may set its own cookies to facilitate the authentication process. These are governed by <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-primary-mint hover:underline">Google's privacy policy</a>. Once authentication is complete, Next Door uses only its own essential cookies as described above.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              Managing Cookies
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Most web browsers allow you to control cookies through their settings. However, if you disable essential cookies, you will not be able to use Next Door as the app requires them to function.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              To clear cookies that have already been set, you can use your browser's settings to delete them. Note that this will log you out of Next Door and reset your preferences (including theme selection).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              Consent
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              During profile setup, you are asked to acknowledge our cookie usage as part of the consent process. By completing setup and using Next Door, you consent to the use of essential cookies as described in this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              Contact Us
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              If you have questions about our use of cookies, please contact us at:{' '}
              <a 
                href="mailto:deepakkrishnar1618@gmail.com" 
                className="text-emerald-600 dark:text-primary-mint hover:underline"
              >
                deepakkrishnar1618@gmail.com
              </a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-700 py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            © {new Date().getFullYear()} Next Door. All rights reserved.
          </p>
          <div className="mt-2 flex justify-center gap-4 text-sm">
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-primary-mint hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-primary-mint hover:underline">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
