import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppConfig } from "./config";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 8 * 1024 * 1024;

export async function downloadInboundImage(organizationId: string, mediaId: string) {
  const config = getWhatsAppConfig();
  if (config.runtime !== "production" || !config.accessToken) {
    throw new Error("Live WhatsApp media configuration is unavailable.");
  }
  const metadataResponse = await fetch(
    `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(mediaId)}`,
    {
      headers: { authorization: `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const metadata = await metadataResponse.json() as {
    url?: string;
    mime_type?: string;
    file_size?: number;
    sha256?: string;
  };
  if (
    !metadataResponse.ok || !metadata.url || !metadata.mime_type
    || !allowedTypes.has(metadata.mime_type)
    || !Number.isFinite(metadata.file_size) || Number(metadata.file_size) > maxBytes
  ) throw new Error("Inbound WhatsApp image failed metadata validation.");

  const mediaResponse = await fetch(metadata.url, {
    headers: { authorization: `Bearer ${config.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!mediaResponse.ok) throw new Error("Inbound WhatsApp image download failed.");
  const contentType = mediaResponse.headers.get("content-type")?.split(";")[0] ?? "";
  const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  if (!allowedTypes.has(contentType) || bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new Error("Inbound WhatsApp image content is invalid.");
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (metadata.sha256 && metadata.sha256.toLowerCase() !== hash) {
    throw new Error("Inbound WhatsApp image hash does not match Meta metadata.");
  }
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  // Inbound images currently enter the deterministic payment-proof flow.
  // Store them in the same private bucket and organization-scoped namespace
  // used by owner review so no cross-bucket copy is needed later.
  const objectKey = `organizations/${organizationId}/payment-evidence/${randomUUID()}.${extension}`;
  const { error } = await getSupabaseAdmin().storage.from("payment-evidence").upload(objectKey, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error("Inbound WhatsApp image could not be stored privately.");
  return { objectKey, contentType, fileHash: hash, size: bytes.byteLength };
}
