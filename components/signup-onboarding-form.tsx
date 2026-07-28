"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";

type SignupOnboardingFormProps = {
  whatsappNumber: string;
};

function cleanLine(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function SignupOnboardingForm({ whatsappNumber }: SignupOnboardingFormProps) {
  const [ownerName, setOwnerName] = useState("");
  const [pgName, setPgName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const configured = /^\d{10,15}$/.test(whatsappNumber);
  const message = useMemo(() => [
    "Hi PGFlow, I want to request onboarding for a new PG workspace.",
    `Owner: ${cleanLine(ownerName) || "Not provided"}`,
    `PG name: ${cleanLine(pgName) || "Not provided"}`,
    `City: ${cleanLine(city) || "Not provided"}`,
    `My WhatsApp number: ${cleanLine(phone) || "Not provided"}`,
    "I want to start with up to 2 residents.",
  ].join("\n"), [city, ownerName, pgName, phone]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;
    setSubmitted(true);
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <form className="signup-form" onSubmit={submit}>
      <div className="signup-field-grid">
        <label>
          Your name
          <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} maxLength={80} autoComplete="name" required />
        </label>
        <label>
          PG name
          <input value={pgName} onChange={(event) => setPgName(event.target.value)} maxLength={120} autoComplete="organization" required />
        </label>
      </div>
      <div className="signup-field-grid">
        <label>
          City
          <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={80} autoComplete="address-level2" required />
        </label>
        <label>
          Your WhatsApp number
          <input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={20} inputMode="tel" autoComplete="tel" required />
        </label>
      </div>
      <button className="home-primary-button signup-submit" type="submit" disabled={!configured}>
        <MessageCircle size={19} />
        Request onboarding on WhatsApp
        <ArrowRight size={18} />
      </button>
      {configured ? (
        <p className="signup-form-note" role={submitted ? "status" : undefined}>
          {submitted
            ? "WhatsApp opened with your details. Send the prepared message to begin onboarding."
            : "Your details stay in your browser until you choose to send the prepared WhatsApp message."}
        </p>
      ) : (
        <p className="signup-form-error" role="alert">
          New-workspace onboarding is temporarily unavailable because the PGFlow support number is not configured.
        </p>
      )}
    </form>
  );
}
