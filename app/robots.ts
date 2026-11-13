import type { MetadataRoute } from "next";

/** Only the public marketing and legal pages may be crawled. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/privacy", "/terms"], disallow: "/" }],
  };
}
