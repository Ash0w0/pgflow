import "server-only";

import { isIP } from "node:net";
import { getSupabaseAdmin } from "./supabase/admin";

const WINDOW_SECONDS = 15 * 60;
const PHONE_LIMIT = 10;
const IP_LIMIT = 30;

type LimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function rateLimitSecret() {
  const explicit = process.env.AUTH_RATE_LIMIT_SECRET?.trim();
  if (explicit) return explicit;
  const serviceKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!serviceKey) throw new Error("AUTH_RATE_LIMIT_SECRET or SUPABASE_SECRET_KEY is required.");
  return `pgflow-auth-rate-limit-v1:${serviceKey}`;
}

async function hmacHex(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rateLimitSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "";
  if (isIP(forwarded)) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  return isIP(realIp) ? realIp : null;
}

function firstRecord(value: unknown) {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

async function consume(scope: string, identity: string, limit: number): Promise<LimitResult> {
  const bucketHash = await hmacHex(`${scope}\u0000${identity}`);
  const { data, error } = await getSupabaseAdmin().rpc("consume_auth_rate_limit", {
    p_bucket_hash: bucketHash,
    p_scope: scope,
    p_limit: limit,
    p_window_seconds: WINDOW_SECONDS,
  });
  if (error) throw new Error("Authentication rate limiter is unavailable.", { cause: error });
  const record = firstRecord(data);
  if (!record || typeof record.allowed !== "boolean" || typeof record.retryAfterSeconds !== "number") {
    throw new Error("Authentication rate limiter returned an invalid result.");
  }
  return {
    allowed: record.allowed,
    retryAfterSeconds: Math.max(1, Math.ceil(record.retryAfterSeconds)),
  };
}

export async function consumeAuthenticationLimits(
  request: Request,
  hostname: string,
  normalizedPhone: string,
): Promise<LimitResult> {
  const boundedPhone = normalizedPhone.slice(0, 64);
  const phoneResult = await consume("host_phone", `${hostname}\u0000${boundedPhone}`, PHONE_LIMIT);
  const ip = clientIp(request);
  if (!ip) return phoneResult;
  const ipResult = await consume("host_ip", `${hostname}\u0000${ip}`, IP_LIMIT);
  if (phoneResult.allowed && ipResult.allowed) return { allowed: true, retryAfterSeconds: 1 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(phoneResult.retryAfterSeconds, ipResult.retryAfterSeconds),
  };
}
