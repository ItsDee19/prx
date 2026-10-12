"use client";

/*
 * Last-resort boundary for errors thrown by the root layout itself, so neither
 * globals.css nor the fonts can be relied on: everything is inline, with the
 * Aurora Grid colours for light and dark taken from the OS setting.
 */
const STYLES = `
  .prx-ge { --bg:#f5f5f7; --surface:#ffffff; --border:#e4e4ea; --fg:#1d1d1f; --muted:#5c5c66; --accent:#0066cc; --accent-fg:#ffffff; --ring:#0071e3; }
  @media (prefers-color-scheme: dark) {
    .prx-ge { --bg:#09090b; --surface:#111114; --border:#232329; --fg:#f5f5f7; --muted:#a1a1aa; --accent:#2997ff; --accent-fg:#09090b; --ring:#2997ff; }
  }
  .prx-ge { margin:0; min-height:100dvh; display:flex; align-items:center; justify-content:center; padding:24px 16px;
    background:var(--bg); color:var(--fg); font:14px/20px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background-image:radial-gradient(600px circle at 20% -10%, rgb(0 113 227 / .12), transparent 70%), radial-gradient(600px circle at 90% 0%, rgb(110 86 207 / .1), transparent 70%); }
  .prx-ge-card { width:100%; max-width:420px; box-sizing:border-box; text-align:center; padding:40px 24px; border-radius:20px;
    background:var(--surface); border:1px solid var(--border); box-shadow:0 12px 32px -8px rgb(16 16 24 / .18); }
  .prx-ge-mark { width:40px; height:40px; margin:0 auto 20px; border-radius:11px; color:#fff; font-weight:700; font-size:18px;
    display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#0071e3 0%,#6e56cf 55%,#22d3ee 100%); }
  .prx-ge h1 { font-size:20px; line-height:28px; letter-spacing:-0.02em; margin:0; font-weight:600; }
  .prx-ge p { color:var(--muted); margin:8px 0 0; }
  .prx-ge button { margin-top:24px; height:36px; padding:0 18px; border-radius:9999px; border:0; cursor:pointer;
    background:var(--accent); color:var(--accent-fg); font-family:inherit; font-size:14px; line-height:20px; font-weight:500; }
  .prx-ge button:focus-visible { outline:2px solid var(--ring); outline-offset:2px; }
  .prx-ge button:active { transform:scale(.97); }
`;

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body className="prx-ge">
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
        <main className="prx-ge-card">
          <div className="prx-ge-mark" aria-hidden>
            P
          </div>
          <h1>PRX could not start.</h1>
          <p>Something went wrong while loading the app. Try again in a moment.</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
