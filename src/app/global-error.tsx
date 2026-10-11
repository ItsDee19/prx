"use client";

/** Last-resort boundary for errors thrown by the root layout itself. */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          background: "#f6f6f8",
          color: "#1a1a21",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>PRX could not start</h1>
          <p style={{ color: "#6b6b78", marginTop: 8 }}>An unexpected error occurred.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 8,
              border: 0,
              background: "#5b5bd6",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
