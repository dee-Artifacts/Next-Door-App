import { ImageResponse } from "next/og";

// Social share card (LinkedIn, X/Twitter, WhatsApp, Slack, Discord, iMessage, etc.)
// Rendered once at build time (no runtime export), so crawlers get a static PNG.
export const alt =
  "Next Door, an open-source, self-hosted neighbourhood community app";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0E3A27",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "76px",
              height: "76px",
              borderRadius: "20px",
              backgroundColor: "#F6F4ED",
              color: "#0E3A27",
              fontSize: "42px",
              fontWeight: 700,
            }}
          >
            N
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#F6F4ED",
                fontSize: "34px",
                fontWeight: 600,
                letterSpacing: "-0.5px",
              }}
            >
              Next Door
            </div>
            <div
              style={{
                color: "rgba(246,244,237,0.6)",
                fontSize: "18px",
                letterSpacing: "5px",
                textTransform: "uppercase",
              }}
            >
              Neighbourhood Chat
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              color: "#F6F4ED",
              fontSize: "70px",
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: "-2px",
              maxWidth: "940px",
            }}
          >
            Your friendly neighbourhood, self-hosted.
          </div>
          <div
            style={{
              color: "rgba(246,244,237,0.72)",
              fontSize: "30px",
              lineHeight: 1.4,
              maxWidth: "880px",
            }}
          >
            Open-source community app. Real-time chat, events, and a private
            marketplace.
          </div>
        </div>

        {/* Footer: trust pills + URL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: "14px" }}>
            {["No ads", "No tracking", "Your data"].map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  color: "#0E3A27",
                  backgroundColor: "#F6F4ED",
                  borderRadius: "999px",
                  padding: "10px 22px",
                  fontSize: "22px",
                  fontWeight: 600,
                }}
              >
                {t}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", color: "rgba(246,244,237,0.7)", fontSize: "24px" }}>
            nextdoor.deeproduct.org
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
