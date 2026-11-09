import { configuredSecret, secureEqual } from "./secure-compare.ts";

/**
 * Authorizes a scheduled job request. Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>`. There is no fallback secret: an
 * unconfigured deployment refuses every cron request.
 */
export function authorizeCronRequest(request: Request): Response | null {
  if (process.env.PGFLOW_RUNTIME === "demo") return null;

  const secret = configuredSecret("CRON_SECRET");
  if (!secret) {
    return Response.json(
      { error: "Scheduled jobs are not configured on this deployment." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  if (!secureEqual(header, `Bearer ${secret}`)) {
    return Response.json(
      { error: "Unauthorized scheduled job request." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  return null;
}
