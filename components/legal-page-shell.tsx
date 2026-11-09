import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LegalPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="legal-page">
      <header className="signup-nav">
        <Link className="home-logo" href="/" aria-label="Back to PGFlow homepage">
          <span aria-hidden="true">P</span>
          <strong>PGFlow</strong>
        </Link>
        <Link href="/"><ArrowLeft size={17} /> Back to homepage</Link>
      </header>
      <article className="legal-article">{children}</article>
    </main>
  );
}
