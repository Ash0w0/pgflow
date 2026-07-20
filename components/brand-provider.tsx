"use client";

import { createContext, useContext, type ReactNode } from "react";

export type BrandValue = {
  name: string;
  shortName: string;
  primary: string;
  accent: string;
  mode: "demo" | "tenant" | "platform";
  platformName: string;
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
