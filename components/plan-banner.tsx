"use client";

import { Clock3, Lock, MessageCircle } from "lucide-react";
import { useBrand } from "./brand-provider";

function whatsappHref(message: string) {
  const number = (process.env.NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  return /^\d{10,15}$/.test(number) ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    .format(new Date(value));
}

/** Trial countdown, paid-renewal reminder, or read-only notice for a PG workspace. */
export function PlanBanner() {
  const { plan, name } = useBrand();
  if (!plan) return null;
  if (plan.status === "paid" && plan.daysLeft > 7) return null;

  const upgrade = whatsappHref(`Hi PGFlow, I want to continue using PGFlow for ${name}.`);

  if (plan.status === "expired") {
    return (
      <div className="plan-banner plan-banner-expired" role="alert">
        <Lock size={18} />
        <span>
          <strong>Your free trial has ended. This workspace is read-only.</strong>
          You can still view records and approve pending payments. Contact PGFlow to keep adding residents, rent and payment links.
        </span>
        {upgrade && <a href={upgrade} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Continue on WhatsApp</a>}
      </div>
    );
  }

  const label = plan.status === "trial" ? "Free trial" : "Paid plan";
  const days = `${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} left`;
  return (
    <div className={`plan-banner ${plan.daysLeft <= 3 ? "plan-banner-urgent" : ""}`} role="status">
      <Clock3 size={18} />
      <span>
        <strong>{label}: {days}</strong>
        {plan.endsAt ? `Ends on ${formatDate(plan.endsAt)}.` : ""} {plan.status === "trial" ? "Everything is unlocked during your trial." : "Renew to keep your workspace writable."}
      </span>
      {upgrade && <a href={upgrade} target="_blank" rel="noreferrer"><MessageCircle size={15} /> {plan.status === "trial" ? "Upgrade on WhatsApp" : "Renew on WhatsApp"}</a>}
    </div>
  );
}
