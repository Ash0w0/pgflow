"use client";

import { useReducedMotion } from "motion/react";
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * The visitor's reduced-motion preference, reported as false during server
 * rendering and hydration so the first client render matches the HTML.
 */
export function usePrefersReducedMotion() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const reduce = useReducedMotion();
  return hydrated && reduce === true;
}
