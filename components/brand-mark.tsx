"use client";

import Link from "next/link";
import { demoBrand } from "@/lib/demo-data";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand-mark" href="/" aria-label={`${demoBrand.name} dashboard`}>
      <span className="brand-symbol" aria-hidden="true">
        <span>N</span>
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>{demoBrand.shortName}</strong>
          <small>Demo House</small>
        </span>
      )}
    </Link>
  );
}

export function PoweredBy() {
  return (
    <span className="powered-by">
      Powered by <strong>{demoBrand.platform}</strong>
    </span>
  );
}
