import Script from "next/script";

/* Self-hosted Umami analytics.
 *
 * Reports through analytics.deeproduct.org rather than a shared analytics host, because ad
 * blockers match on the destination hostname. That host shares its registrable domain
 * (deeproduct.org) with this site, so the request is same-site and is on no blocklist.
 *
 * HOST AND ID MUST MOVE TOGETHER. The website ID below only exists on the Umami instance
 * behind this host. Pointing it at any other instance returns 200 and silently discards
 * every event, with no error anywhere. Change one and you must change the other.
 *
 * The host is a constant, not an env var, on purpose: two build-time variables means two
 * things that can be silently missing at build time. The host only changes if the whole
 * analytics stack moves, which is a code change regardless.
 *
 * Renders nothing when the env var is absent, which is the normal state of a fresh
 * checkout, so local dev stays out of the numbers. Umami sets no cookies and stores no
 * personal data, so this sits in front of no consent gate.
 */
const UMAMI_HOST = "https://analytics.deeproduct.org";

/** Global the tracker calls before every send; see the scrub note below. */
const SCRUB_FN = "__umamiScrubIds";

export default function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

  if (!websiteId) return null;

  return (
    <>
      {/* Runs before the tracker so the hook exists by the time it sends. Three routes
       *  carry a Supabase UUID in the path (/profile/[userId], /events/[id]/chat,
       *  /market/[id]/chat). A raw UUID is a pseudonymous identifier, so it must not
       *  reach the analytics database. Collapsing it to :id also makes the numbers
       *  more useful — every profile view aggregates onto one row instead of
       *  scattering across thousands of unique URLs. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.${SCRUB_FN}=function(t,p){if(p&&p.url){p.url=p.url.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,':id');}return p;};`,
        }}
      />
      <Script
        src={`${UMAMI_HOST}/script.js`}
        data-website-id={websiteId}
        data-domains="nextdoor.deeproduct.org"
        data-before-send={SCRUB_FN}
        strategy="afterInteractive"
      />
    </>
  );
}
