"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlanSummary } from "@/lib/plan";

export type BrandValue = {
  name: string;
  shortName: string;
  primary: string;
  accent: string;
  mode: "demo" | "tenant" | "platform";
  platformName: string;
  /** Trial/paid status of the PG workspace; absent on the platform and demo. */
  plan?: PlanSummary;
};

const DEFAULT_BRAND: BrandValue = {
  name: "PGFlow",
  shortName: "PGFlow",
  primary: "#123d32",
  accent: "#d7ff86",
  mode: "platform",
  platformName: "PGFlow",
};

const BrandContext = createContext<BrandValue>(DEFAULT_BRAND);

export function BrandProvider({ brand, children }: { brand: BrandValue; children: ReactNode }) {
  return <BrandContext value={brand}>{children}</BrandContext>;
}

export function useBrand() {
  return useContext(BrandContext);
}
