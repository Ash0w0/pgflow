import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Page not found</h1>
        <p style={{ margin: "8px 0 20px", opacity: 0.7 }}>This page does not exist or is not available on this workspace.</p>
        <Link href="/" style={{ textDecoration: "underline" }}>Go to the home page</Link>
      </div>
    </main>
  );
}
