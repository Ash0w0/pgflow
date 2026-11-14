"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { handleDemoRequest } from "./api";
import { getDemoState, getDemoVersion, getServerDemoVersion, subscribeDemo, type DemoState } from "./store";

declare global {
  interface Window { __pgflowDemoFetch?: boolean }
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<Record<string, unknown>> {
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  if (typeof raw !== "string" || !raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** Answers PG API calls from the in-browser demo store instead of the network. */
function installDemoFetch() {
  if (typeof window === "undefined" || window.__pgflowDemoFetch) return;
  window.__pgflowDemoFetch = true;
  const networkFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
      if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const result = handleDemoRequest(method, url.pathname, await readBody(input, init), window.location.origin);
        if (result) {
          // A short pause so buttons show their "saving" state like the real product.
          await new Promise((resolve) => window.setTimeout(resolve, 220));
          return new Response(JSON.stringify(result.body), {
            status: result.status,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        }
      }
    } catch {
      // Anything unexpected falls through to the network.
    }
    return networkFetch(input, init);
  };
}

/** Mounted once by the root layout in demo mode. */
export function DemoRuntime() {
  // Runs during the first render, before any screen's effects can call the API.
  useState(() => { installDemoFetch(); return true; });
  return null;
}

/** Re-renders with a fresh view whenever the demo PG changes. */
export function useDemoView<T>(select: (state: DemoState) => T): T {
  const version = useSyncExternalStore(subscribeDemo, getDemoVersion, getServerDemoVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the change signal for the mutable store.
  return useMemo(() => select(getDemoState()), [version, select]);
}
