"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "grid", placeItems: "center", margin: 0, padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p style={{ opacity: 0.7 }}>Nothing was changed. Support code: <code>{error.digest ?? "unavailable"}</code></p>
          <button type="button" onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  );
}
