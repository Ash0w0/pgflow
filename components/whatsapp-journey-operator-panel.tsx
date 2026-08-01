"use client";

import Image from "next/image";
import {
  AlertTriangle,
  Check,
  Clipboard,
  ExternalLink,
  MessageCircle,
  RefreshCcw,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type ContactSnapshot = {
  id: string;
  language_code: "en" | "hi";
  consent_state: "unknown" | "opted_in" | "opted_out";
  reminders_enabled: boolean;
  weekly_report_enabled: boolean;
  activated_at: string | null;
};

type ActivationSubject = {
  id: string;
  organizationId: string;
  subjectType: "owner" | "resident";
  role: string;
  name: string;
  maskedPhone: string;
  state: string;
  whatsapp: ContactSnapshot | null;
};

type ActivationDirectory = {
  organizations: Array<{ id: string; name: string; state: string }>;
  subjects: ActivationSubject[];
};

type ActivationResult = {
  contactId: string;
  activationUrl: string;
  qrValue: string;
  expiresAt: string;
};

type WeeklyPreview = {
  organizationId: string;
  organizationName: string;
  ownerMembershipId: string;
  ownerName: string;
  propertyName: string;
  languageCode: "en" | "hi";
  weekStart: string;
  weekEnd: string;
  ready: boolean;
  blockers: string[];
  metrics: {
    approvedCollections: number;
    approvedPaymentCount: number;
    outstandingRent: number;
    overdueRent: number;
    occupiedBeds: number;
    totalBeds: number;
    movedIn: number;
    movedOut: number;
    pendingPaymentReviews: number;
    maintenanceOpened: number;
    maintenanceResolved: number;
    maintenanceOutstanding: number;
    moveOutRequests: number;
  };
};

function previousCompletedMonday() {
  const today = new Date();
  const daysSinceMonday = (today.getDay() + 6) % 7;
  today.setDate(today.getDate() - daysSinceMonday - 7);
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function WhatsAppJourneyOperatorPanel() {
  const [directory, setDirectory] = useState<ActivationDirectory | null>(null);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState("");
  const [subjectType, setSubjectType] = useState<"owner" | "resident">("owner");
  const [subjectId, setSubjectId] = useState("");
  const [languageCode, setLanguageCode] = useState<"en" | "hi">("en");
  const [activation, setActivation] = useState<ActivationResult | null>(null);
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState("");
  const [qrImage, setQrImage] = useState<{ value: string; dataUrl: string } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");

  const [weeklyOrganizationId, setWeeklyOrganizationId] = useState("");
  const [ownerMembershipId, setOwnerMembershipId] = useState("");
  const [weekStart, setWeekStart] = useState(previousCompletedMonday);
  const [weeklyPreview, setWeeklyPreview] = useState<WeeklyPreview | null>(null);
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [weeklyError, setWeeklyError] = useState("");
  const [weeklyConfirmed, setWeeklyConfirmed] = useState(false);
  const [weeklyFeedback, setWeeklyFeedback] = useState("");

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    setDirectoryError("");
    try {
      const response = await fetch("/api/operator/whatsapp/activation", { credentials: "same-origin" });
      const payload = await response.json() as ActivationDirectory & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Activation directory could not be loaded.");
      setDirectory(payload);
    } catch (caught) {
      setDirectoryError(caught instanceof Error ? caught.message : "Activation directory could not be loaded.");
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/operator/whatsapp/activation", { credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json() as ActivationDirectory & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Activation directory could not be loaded.");
        return payload;
      })
      .then((payload) => {
        if (active) setDirectory(payload);
      })
      .catch((caught: Error) => {
        if (active) setDirectoryError(caught.message);
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!activation?.qrValue) return () => { active = false; };
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(activation.qrValue, {
        width: 232,
        margin: 1,
        color: { dark: "#123d32", light: "#ffffff" },
        errorCorrectionLevel: "M",
      }))
      .then((value) => {
      if (active) setQrImage({ value: activation.qrValue, dataUrl: value });
    }).catch(() => {
      if (active) setActivationError("The link was created, but its QR code could not be rendered.");
    });
    return () => { active = false; };
  }, [activation]);

  const selectedOrganizationId = organizationId || directory?.organizations[0]?.id || "";
  const activationSubjects = useMemo(
    () => (directory?.subjects ?? []).filter(
      (subject) => subject.organizationId === selectedOrganizationId && subject.subjectType === subjectType,
    ),
    [directory, selectedOrganizationId, subjectType],
  );
  const selectedSubjectId = activationSubjects.some((subject) => subject.id === subjectId)
    ? subjectId
    : activationSubjects[0]?.id ?? "";
  const selectedSubject = activationSubjects.find((subject) => subject.id === selectedSubjectId) ?? null;
  const qrDataUrl = qrImage && qrImage.value === activation?.qrValue ? qrImage.dataUrl : "";

  const selectedWeeklyOrganizationId = weeklyOrganizationId || directory?.organizations[0]?.id || "";
  const weeklyOwners = useMemo(
    () => (directory?.subjects ?? []).filter(
      (subject) => subject.organizationId === selectedWeeklyOrganizationId && subject.subjectType === "owner",
    ),
    [directory, selectedWeeklyOrganizationId],
  );
  const selectedOwnerMembershipId = weeklyOwners.some((owner) => owner.id === ownerMembershipId)
    ? ownerMembershipId
    : weeklyOwners[0]?.id ?? "";

  function resetActivationResult() {
    setActivation(null);
    setActivationError("");
    setCopyFeedback("");
  }

  function resetWeeklyPreview() {
    setWeeklyPreview(null);
    setWeeklyConfirmed(false);
    setWeeklyError("");
    setWeeklyFeedback("");
  }

  async function generateActivation(event: FormEvent) {
    event.preventDefault();
    if (!selectedOrganizationId || !selectedSubjectId) return;
    setActivationBusy(true);
    resetActivationResult();
    try {
      const response = await fetch("/api/operator/whatsapp/activation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrganizationId,
          subjectId: selectedSubjectId,
          subjectType,
          languageCode,
        }),
      });
      const payload = await response.json() as ActivationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Activation link could not be created.");
      setActivation(payload);
      await loadDirectory();
    } catch (caught) {
      setActivationError(caught instanceof Error ? caught.message : "Activation link could not be created.");
    } finally {
      setActivationBusy(false);
    }
  }

  async function copyActivationLink() {
    if (!activation) return;
    try {
      await navigator.clipboard.writeText(activation.activationUrl);
      setCopyFeedback("Activation link copied.");
    } catch {
      setCopyFeedback("Copy failed. Select the link and copy it manually.");
    }
  }

  async function previewWeeklyReport(event: FormEvent) {
    event.preventDefault();
    if (!selectedWeeklyOrganizationId || !selectedOwnerMembershipId || !weekStart) return;
    setWeeklyBusy(true);
    resetWeeklyPreview();
    try {
      const params = new URLSearchParams({
        organizationId: selectedWeeklyOrganizationId,
        ownerMembershipId: selectedOwnerMembershipId,
        weekStart,
      });
      const response = await fetch(`/api/operator/whatsapp/weekly-report?${params}`, {
        credentials: "same-origin",
      });
      const payload = await response.json() as { preview?: WeeklyPreview; error?: string };
      if (!response.ok || !payload.preview) {
        throw new Error(payload.error ?? "Weekly report preview could not be loaded.");
      }
      setWeeklyPreview(payload.preview);
    } catch (caught) {
      setWeeklyError(caught instanceof Error ? caught.message : "Weekly report preview could not be loaded.");
    } finally {
      setWeeklyBusy(false);
    }
  }

  async function queueWeeklyReport() {
    if (!weeklyPreview?.ready || !weeklyConfirmed) return;
    setWeeklyBusy(true);
    setWeeklyError("");
    setWeeklyFeedback("");
    try {
      const response = await fetch("/api/operator/whatsapp/weekly-report", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: weeklyPreview.organizationId,
          ownerMembershipId: weeklyPreview.ownerMembershipId,
          weekStart: weeklyPreview.weekStart,
          confirmation: "queue_weekly_report",
        }),
      });
      const payload = await response.json() as {
        messageId?: string;
        deduplicated?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Weekly report could not be queued.");
      setWeeklyFeedback(payload.deduplicated
        ? "This weekly report was already queued; no duplicate was created."
        : "Weekly report queued for WhatsApp delivery.");
      setWeeklyConfirmed(false);
    } catch (caught) {
      setWeeklyError(caught instanceof Error ? caught.message : "Weekly report could not be queued.");
    } finally {
      setWeeklyBusy(false);
    }
  }

  return (
    <section className="panel whatsapp-journey-panel" aria-labelledby="whatsapp-journey-title">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Journey controls</span>
          <h2 id="whatsapp-journey-title">Activate contacts and preview owner reports</h2>
          <p>Create one-time START links, then inspect the exact weekly numbers before explicitly queuing a message.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void loadDirectory()} disabled={directoryLoading}>
          <RefreshCcw className={directoryLoading ? "spin" : ""} size={16} />
          {directoryLoading ? "Loading…" : "Refresh contacts"}
        </button>
      </div>

      {directoryError && (
        <div className="setup-feedback error" role="alert">
          <AlertTriangle size={17} />{directoryError}
        </div>
      )}

      <div className="whatsapp-journey-grid">
        <section className="whatsapp-journey-section" aria-labelledby="activation-control-title">
          <div className="whatsapp-section-heading">
            <span><MessageCircle size={18} /></span>
            <div>
              <h3 id="activation-control-title">One-time WhatsApp activation</h3>
              <p>The resident or owner must open the link and send START. The raw token expires after seven days.</p>
            </div>
          </div>

          <form className="modal-form" onSubmit={generateActivation}>
            <label htmlFor="activation-organization">
              Organization
              <select
                id="activation-organization"
                value={selectedOrganizationId}
                onChange={(event) => {
                  setOrganizationId(event.target.value);
                  setSubjectId("");
                  resetActivationResult();
                }}
                disabled={directoryLoading || activationBusy}
                required
              >
                {directory?.organizations.length === 0 && <option value="">No organizations available</option>}
                {directory?.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label htmlFor="activation-subject-type">
                Contact type
                <select
                  id="activation-subject-type"
                  value={subjectType}
                  onChange={(event) => {
                    setSubjectType(event.target.value as "owner" | "resident");
                    setSubjectId("");
                    resetActivationResult();
                  }}
                  disabled={activationBusy}
                >
                  <option value="owner">Owner / accountant</option>
                  <option value="resident">Resident</option>
                </select>
              </label>
              <label htmlFor="activation-language">
                Preferred language
                <select
                  id="activation-language"
                  value={languageCode}
                  onChange={(event) => {
                    setLanguageCode(event.target.value as "en" | "hi");
                    resetActivationResult();
                  }}
                  disabled={activationBusy}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                </select>
              </label>
            </div>
            <label htmlFor="activation-subject">
              Person
              <select
                id="activation-subject"
                value={selectedSubjectId}
                onChange={(event) => {
                  setSubjectId(event.target.value);
                  resetActivationResult();
                }}
                disabled={activationBusy || activationSubjects.length === 0}
                required
              >
                {activationSubjects.length === 0 && <option value="">No eligible contacts</option>}
                {activationSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name} · {subject.maskedPhone}
                    {subject.whatsapp ? ` · ${subject.whatsapp.consent_state.replace("_", " ")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {selectedSubject?.whatsapp && (
              <p className="whatsapp-contact-state">
                Current consent: <strong>{selectedSubject.whatsapp.consent_state.replace("_", " ")}</strong>
                {selectedSubject.whatsapp.activated_at
                  ? ` · Activated ${formatExpiry(selectedSubject.whatsapp.activated_at)}`
                  : " · START not completed"}
              </p>
            )}
            <button
              className="button button-primary button-full"
              type="submit"
              disabled={activationBusy || !selectedOrganizationId || !selectedSubjectId}
            >
              <MessageCircle size={17} />
              {activationBusy ? "Creating secure link…" : "Create one-time activation link"}
            </button>
          </form>

          {activationError && <div className="setup-feedback error" role="alert"><AlertTriangle size={17} />{activationError}</div>}
          {activation && (
            <div className="activation-result" role="status">
              <div className="activation-qr">
                {qrDataUrl
                  ? (
                      <Image
                        src={qrDataUrl}
                        alt="QR code for the one-time WhatsApp activation link"
                        width={174}
                        height={174}
                        unoptimized
                      />
                    )
                  : <RefreshCcw className="spin" aria-label="Rendering QR code" size={22} />}
              </div>
              <div className="activation-link-copy">
                <strong>Share only with {selectedSubject?.name ?? "this contact"}</strong>
                <p>Expires {formatExpiry(activation.expiresAt)}. Creating another link revokes this unused link.</p>
                <label htmlFor="activation-url">WhatsApp link</label>
                <input
                  id="activation-url"
                  value={activation.activationUrl}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
                <div className="invoice-actions">
                  <button className="button button-secondary" type="button" onClick={() => void copyActivationLink()}>
                    <Clipboard size={16} />Copy link
                  </button>
                  <a className="button button-primary" href={activation.activationUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />Open WhatsApp
                  </a>
                </div>
                {copyFeedback && <small aria-live="polite">{copyFeedback}</small>}
              </div>
            </div>
          )}
        </section>

        <section className="whatsapp-journey-section" aria-labelledby="weekly-control-title">
          <div className="whatsapp-section-heading">
            <span><Send size={18} /></span>
            <div>
              <h3 id="weekly-control-title">Weekly owner report</h3>
              <p>Preview reads current production records. Nothing is queued until the final checkbox and button are used.</p>
            </div>
          </div>

          <form className="modal-form" onSubmit={previewWeeklyReport}>
            <label htmlFor="weekly-organization">
              Organization
              <select
                id="weekly-organization"
                value={selectedWeeklyOrganizationId}
                onChange={(event) => {
                  setWeeklyOrganizationId(event.target.value);
                  setOwnerMembershipId("");
                  resetWeeklyPreview();
                }}
                disabled={directoryLoading || weeklyBusy}
                required
              >
                {directory?.organizations.length === 0 && <option value="">No organizations available</option>}
                {directory?.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label htmlFor="weekly-owner">
                Report recipient
                <select
                  id="weekly-owner"
                  value={selectedOwnerMembershipId}
                  onChange={(event) => {
                    setOwnerMembershipId(event.target.value);
                    resetWeeklyPreview();
                  }}
                  disabled={weeklyBusy || weeklyOwners.length === 0}
                  required
                >
                  {weeklyOwners.length === 0 && <option value="">No active owner contacts</option>}
                  {weeklyOwners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name} · {owner.maskedPhone}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="weekly-start">
                Week beginning Monday
                <input
                  id="weekly-start"
                  type="date"
                  value={weekStart}
                  onChange={(event) => {
                    setWeekStart(event.target.value);
                    resetWeeklyPreview();
                  }}
                  disabled={weeklyBusy}
                  required
                />
              </label>
            </div>
            <button
              className="button button-secondary button-full"
              type="submit"
              disabled={weeklyBusy || !selectedWeeklyOrganizationId || !selectedOwnerMembershipId || !weekStart}
            >
              <RefreshCcw className={weeklyBusy ? "spin" : ""} size={17} />
              {weeklyBusy ? "Loading preview…" : "Preview report"}
            </button>
          </form>

          {weeklyError && <div className="setup-feedback error" role="alert"><AlertTriangle size={17} />{weeklyError}</div>}
          {weeklyPreview && (
            <div className="weekly-preview">
              <div className="weekly-preview-heading">
                <div>
                  <strong>{weeklyPreview.ownerName} · {weeklyPreview.propertyName}</strong>
                  <p>{weeklyPreview.weekStart} to {weeklyPreview.weekEnd} · {weeklyPreview.languageCode.toUpperCase()}</p>
                </div>
                <span className={weeklyPreview.ready ? "weekly-ready" : "weekly-blocked"}>
                  {weeklyPreview.ready ? <Check size={14} /> : <AlertTriangle size={14} />}
                  {weeklyPreview.ready ? "Ready to queue" : "Blocked"}
                </span>
              </div>
              <dl className="weekly-metric-list">
                <div><dt>Approved collections</dt><dd>{formatCurrency(weeklyPreview.metrics.approvedCollections)} · {weeklyPreview.metrics.approvedPaymentCount} payments</dd></div>
                <div><dt>Outstanding / overdue</dt><dd>{formatCurrency(weeklyPreview.metrics.outstandingRent)} / {formatCurrency(weeklyPreview.metrics.overdueRent)}</dd></div>
                <div><dt>Occupancy change</dt><dd>{weeklyPreview.metrics.occupiedBeds}/{weeklyPreview.metrics.totalBeds} beds · +{weeklyPreview.metrics.movedIn}/−{weeklyPreview.metrics.movedOut}</dd></div>
                <div><dt>Pending reviews</dt><dd>{weeklyPreview.metrics.pendingPaymentReviews}</dd></div>
                <div><dt>Maintenance</dt><dd>{weeklyPreview.metrics.maintenanceOpened} opened · {weeklyPreview.metrics.maintenanceResolved} resolved · {weeklyPreview.metrics.maintenanceOutstanding} open</dd></div>
                <div><dt>Move-out requests</dt><dd>{weeklyPreview.metrics.moveOutRequests}</dd></div>
              </dl>
              {weeklyPreview.blockers.length > 0 && (
                <ul className="weekly-blockers">
                  {weeklyPreview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              )}
              {weeklyPreview.ready && (
                <label className="weekly-confirmation">
                  <input
                    type="checkbox"
                    checked={weeklyConfirmed}
                    onChange={(event) => setWeeklyConfirmed(event.target.checked)}
                    disabled={weeklyBusy}
                  />
                  <span>I checked this preview and want to queue it for WhatsApp delivery.</span>
                </label>
              )}
              <button
                className="button button-primary button-full"
                type="button"
                onClick={() => void queueWeeklyReport()}
                disabled={weeklyBusy || !weeklyPreview.ready || !weeklyConfirmed}
              >
                <Send size={17} />Queue weekly report
              </button>
              {weeklyFeedback && <div className="setup-feedback success" role="status"><Check size={17} />{weeklyFeedback}</div>}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
