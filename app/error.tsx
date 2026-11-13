"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", event: "ui.render_failed", digest: error.digest ?? null }));
  }, [error]);

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ margin: "8px 0 20px", opacity: 0.7 }}>
          Nothing was changed. Try again, and if this keeps happening share this code with support:{" "}
          <code>{error.digest ?? "unavailable"}</code>
        </p>
        <button type="button" onClick={reset} style={{ textDecoration: "underline" }}>Try again</button>
      </div>
    </main>
  );
}
