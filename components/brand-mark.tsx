"use client";

import Link from "next/link";
import { useBrand } from "./brand-provider";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const brand = useBrand();
  const initial = Array.from(brand.shortName.trim())[0]?.toUpperCase() ?? "P";
  const descriptor = brand.mode === "demo"
    ? "Demo House"
    : brand.mode === "platform"
      ? "Operations platform"
      : "PG workspace";

  return (
    <Link className="brand-mark" href="/" aria-label={brand.name + " dashboard"}>
      <span className="brand-symbol" aria-hidden="true">
        <span>{initial}</span>
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>{brand.shortName}</strong>
          <small>{descriptor}</small>
        </span>
      )}
    </Link>
  );
}

export function PoweredBy() {
  const brand = useBrand();

  return (
    <span className="powered-by">
      Powered by <strong>{brand.platformName}</strong>
    </span>
  );
}
