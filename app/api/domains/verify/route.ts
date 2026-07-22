import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/http";
import { isDemoRuntime } from "@/lib/runtime";
import {
  initiateCustomDomainVerification,
  checkDomainVerification,
  formatTxtRecordValue,
  generateDnsChallenge,
} from "@/lib/custom-domain";

/**
 * POST /api/domains/verify
 * Operator-only endpoint to initiate or check custom domain verification.
 *
 * Body: { action: "initiate", organizationId, hostname }
 *    or { action: "check", domainMappingId }
 */
export async function POST(request: Request) {
  try {
    const isOperator = await requireOperator(request);
    if (!isOperator) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, any>;

    if (isDemoRuntime()) {
      // Demo mode: simulate verification flow
      if (body.action === "initiate") {
        const challenge = generateDnsChallenge();
        return NextResponse.json({
          challenge,
          txtRecord: formatTxtRecordValue(challenge),
          domainMappingId: `demo_domain_${Date.now()}`,
          instructions: `Add a TXT record to ${body.hostname} with value: ${formatTxtRecordValue(challenge)}`,
        });
      }
      if (body.action === "check") {
        return NextResponse.json({
          verified: false,
          hostname: "demo.example.com",
          message: "DNS verification is simulated in demo mode.",
        });
      }
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    // Production mode
    if (body.action === "initiate") {
      if (!body.organizationId || !body.hostname) {
        return NextResponse.json(
          { error: "organizationId and hostname are required." },
          { status: 400 }
        );
      }

      const result = await initiateCustomDomainVerification(
        body.organizationId,
        body.hostname
      );

      return NextResponse.json({
        ...result,
        instructions: `Add a DNS TXT record to ${body.hostname} with value: ${result.txtRecord}`,
      });
    }

    if (body.action === "check") {
      if (!body.domainMappingId) {
        return NextResponse.json(
          { error: "domainMappingId is required." },
          { status: 400 }
        );
      }

      const result = await checkDomainVerification(body.domainMappingId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Domain verification failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
