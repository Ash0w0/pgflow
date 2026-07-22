"use client";

import {
  AlertCircle,
  Building2,
  Check,
  Database,
  Eye,
  EyeOff,
  Globe,
  Layers3,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { OwnerInvitationPanel, type OwnerInvitationOrganization } from "./owner-invitation-panel";
import { OwnerRecoveryPanel } from "./owner-recovery-panel";
import { OperatorPasswordCard } from "./operator-password-card";
import { StatusPill } from "./status-pill";

type RegistryOrganization = OwnerInvitationOrganization & {
  slug: string;
  createdAt: string;
  provisioning: {
    jobId: string;
    state: string;
    updatedAt: string;
  } | null;
};

type ProvisioningRegistry = {
  mode: "production";
  template: {
    version: string;
    blankTemplate: true;
    copiesDemoRecords: false;
  };
  organizations: RegistryOrganization[];
};

type ProvisioningResult = {
  persisted: true;
  job: {
    id: string;
    state: string;
    templateVersion: string;
    organization: {
      id: string;
      name: string;
      slug: string;
    };
    property: {
      id: string;
      name: string;
    };
    hostname: string;
    idempotentReplay: boolean;
  };
};

type ProvisioningForm = {
  name: string;
  slug: string;
  propertyName: string;
  primaryColor: string;
  accentColor: string;
};

type ActionFeedback = {
  tone: "pending" | "success" | "error";
  message: string;
};

const INITIAL_FORM: ProvisioningForm = {
  name: "",
  slug: "",
  propertyName: "",
  primaryColor: "#123d32",
  accentColor: "#d7ff86",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRegistryOrganization(value: unknown): value is RegistryOrganization {
  if (!isRecord(value)) return false;
  const provisioning = value.provisioning;
  const ownerInvitation = value.ownerInvitation;
  const validProvisioning = provisioning === null || (
    isRecord(provisioning)
    && typeof provisioning.jobId === "string"
    && typeof provisioning.state === "string"
    && typeof provisioning.updatedAt === "string"
  );
  const validOwnerInvitation = ownerInvitation === null || (
    isRecord(ownerInvitation)
    && typeof ownerInvitation.id === "string"
    && typeof ownerInvitation.displayName === "string"
    && typeof ownerInvitation.maskedPhone === "string"
    && typeof ownerInvitation.state === "string"
    && (
      ownerInvitation.expiresAt === undefined
      || ownerInvitation.expiresAt === null
      || typeof ownerInvitation.expiresAt === "string"
    )
    && (
      ownerInvitation.credentialState === undefined
      || ownerInvitation.credentialState === null
      || typeof ownerInvitation.credentialState === "string"
    )
    && (
      ownerInvitation.temporaryPasswordExpiresAt === undefined
      || ownerInvitation.temporaryPasswordExpiresAt === null
      || typeof ownerInvitation.temporaryPasswordExpiresAt === "string"
    )
  );

  return (
    typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.slug === "string"
    && typeof value.state === "string"
    && (typeof value.hostname === "string" || value.hostname === null)
    && typeof value.createdAt === "string"
    && validProvisioning
    && validOwnerInvitation
  );
}

function isProvisioningRegistry(value: unknown): value is ProvisioningRegistry {
  if (!isRecord(value) || value.mode !== "production" || !isRecord(value.template)) return false;
  return (
    typeof value.template.version === "string"
    && value.template.blankTemplate === true
    && value.template.copiesDemoRecords === false
    && Array.isArray(value.organizations)
    && value.organizations.every(isRegistryOrganization)
  );
}

function isProvisioningResult(value: unknown): value is ProvisioningResult {
  if (!isRecord(value) || value.persisted !== true || !isRecord(value.job)) return false;
  return (
    typeof value.job.id === "string"
    && typeof value.job.state === "string"
    && value.job.state.length > 0
    && typeof value.job.templateVersion === "string"
    && isRecord(value.job.organization)
    && typeof value.job.organization.id === "string"
    && typeof value.job.organization.name === "string"
    && typeof value.job.organization.slug === "string"
    && isRecord(value.job.property)
    && typeof value.job.property.id === "string"
    && typeof value.job.property.name === "string"
    && typeof value.job.hostname === "string"
    && typeof value.job.idempotentReplay === "boolean"
  );
}

function stateLabel(value: string) {
  if (value === "temporary") return "temporary password";
  return value.replaceAll("_", " ");
}

function stateTone(value: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["live", "core_ready", "complete", "completed", "active", "activated", "password_changed"].includes(value)) return "success";
  if (["failed", "disabled", "suspended", "archived", "expired", "revoked", "temporary_password_expired"].includes(value)) return "danger";
  if (["draft", "awaiting_data", "pending", "provisioning", "temporary", "password_change_required"].includes(value)) return "warning";
  if (["integrations_pending", "ready"].includes(value)) return "info";
  return "neutral";
}

function formatCreatedAt(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function ownerAccessState(invitation: RegistryOrganization["ownerInvitation"]) {
  if (!invitation) return "not_prepared";
  return invitation.credentialState ?? invitation.state;
}

export function LiveOperatorConsole() {
  const [registry, setRegistry] = useState<ProvisioningRegistry | null>(null);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [form, setForm] = useState<ProvisioningForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RegistryOrganization | null>(null);
  const [deleteSlug, setDeleteSlug] = useState("");
  const [deleteOperatorPassword, setDeleteOperatorPassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  // Custom domain verification state
  const [domainOrgId, setDomainOrgId] = useState("");
  const [domainHostname, setDomainHostname] = useState("");
  const [domainChallenge, setDomainChallenge] = useState<string | null>(null);
  const [domainTxtRecord, setDomainTxtRecord] = useState<string | null>(null);
  const [domainMappingId, setDomainMappingId] = useState<string | null>(null);
  const [domainVerified, setDomainVerified] = useState<boolean | null>(null);
  const [domainSubmitting, setDomainSubmitting] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);

  const loadRegistry = useCallback(async (signal?: AbortSignal) => {
    setRegistryLoading(true);
    setRegistryError(null);

    try {
      const response = await fetch("/api/provisioning", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) throw new Error("Registry request failed");

      const result: unknown = await response.json();
      if (!isProvisioningRegistry(result)) throw new Error("Registry response was invalid");
      if (!signal?.aborted) setRegistry(result);
    } catch {
      if (!signal?.aborted) setRegistryError("Unable to load the provisioning registry. Please try again.");
    } finally {
      if (!signal?.aborted) setRegistryLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void loadRegistry(controller.signal), 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadRegistry]);

  function updateField(field: keyof ProvisioningForm, value: string) {
    idempotencyKey.current = null;
    setFeedback(null);
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function provisionShell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const requestKey = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = requestKey;
    setSubmitting(true);
    setFeedback({ tone: "pending", message: "Creating the blank branded PG shell…" });

    try {
      const response = await fetch("/api/provisioning", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, idempotencyKey: requestKey }),
      });
      if (!response.ok) throw new Error("Provisioning request failed");

      const result: unknown = await response.json();
      if (!isProvisioningResult(result)) throw new Error("Provisioning response was invalid");

      const replayNote = result.job.idempotentReplay ? " The existing idempotent result was returned." : "";
      setFeedback({
        tone: "success",
        message: "Blank shell for " + result.job.organization.name + " is persisted at " + result.job.hostname + ". Provisioning state: " + stateLabel(result.job.state) + "." + replayNote,
      });
      setForm({ ...INITIAL_FORM });
      idempotencyKey.current = null;
      await loadRegistry();
    } catch {
      setFeedback({
        tone: "error",
        message: "Unable to create the PG shell. No completion is being claimed; review the fields and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function openDeleteDialog(organization: RegistryOrganization) {
    if (organization.state !== "draft") return;
    setDeleteTarget(organization);
    setDeleteSlug("");
    setDeleteOperatorPassword("");
    setShowDeletePassword(false);
    setDeleteError(null);
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteSlug("");
    setDeleteOperatorPassword("");
    setShowDeletePassword(false);
    setDeleteError(null);
  }

  async function deleteDraftOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      deleting
      || !deleteTarget
      || deleteTarget.state !== "draft"
      || deleteSlug !== deleteTarget.slug
      || deleteOperatorPassword.length < 8
    ) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/provisioning", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: deleteTarget.id,
          confirmationSlug: deleteSlug,
          operatorPassword: deleteOperatorPassword,
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = isRecord(result) && typeof result.error === "string"
          ? result.error
          : "The draft PG could not be deleted. Nothing was partially removed.";
        throw new Error(message);
      }
      if (
        !isRecord(result)
        || result.deleted !== true
        || result.organizationId !== deleteTarget.id
        || result.slug !== deleteTarget.slug
      ) throw new Error("Deletion returned an invalid result. Refresh the registry before continuing.");

      setDeleteTarget(null);
      setDeleteSlug("");
      setDeleteOperatorPassword("");
      setShowDeletePassword(false);
      setFeedback({
        tone: "success",
        message: `${deleteTarget.name} was permanently removed. You can now create a fresh blank PG shell.`,
      });
      await loadRegistry();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "The draft PG could not be deleted.");
    } finally {
      setDeleteOperatorPassword("");
      setDeleting(false);
    }
  }

  const organizations = registry?.organizations ?? [];
  const templateVersion = registry?.template.version;

  async function initiateCustomDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (domainSubmitting || !domainOrgId || !domainHostname) return;
    setDomainSubmitting(true);
    setDomainError(null);
    setDomainChallenge(null);
    setDomainVerified(null);
    try {
      const res = await fetch("/api/domains/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "initiate", organizationId: domainOrgId, hostname: domainHostname.toLowerCase().trim() }),
      });
      const result: unknown = await res.json().catch(() => null);
      if (!res.ok || !isRecord(result)) throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Failed to initiate domain verification.");
      setDomainChallenge(typeof result.challenge === "string" ? result.challenge : null);
      setDomainTxtRecord(typeof result.txtRecord === "string" ? result.txtRecord : null);
      setDomainMappingId(typeof result.domainMappingId === "string" ? result.domainMappingId : null);
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Failed to initiate domain verification.");
    } finally {
      setDomainSubmitting(false);
    }
  }

  async function checkCustomDomain() {
    if (domainSubmitting || !domainMappingId) return;
    setDomainSubmitting(true);
    setDomainError(null);
    try {
      const res = await fetch("/api/domains/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "check", domainMappingId }),
      });
      const result: unknown = await res.json().catch(() => null);
      if (!res.ok || !isRecord(result)) throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Verification check failed.");
      setDomainVerified(result.verified === true);
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Verification check failed.");
    } finally {
      setDomainSubmitting(false);
    }
  }

  return (
    <div className="operator-page page-stack live-operator-page">
      <section className="page-heading">
        <div>
          <div className="demo-kicker"><ShieldCheck size={14} /> Authorized operator console</div>
          <h1>Blank-shell provisioning</h1>
          <p>Create and review persisted PG shells without copying demo residents, rooms, payments, or operational records.</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void loadRegistry()}
          disabled={registryLoading}
        >
          <RefreshCcw className={registryLoading ? "spin" : ""} size={17} />
          {registryLoading ? "Refreshing…" : "Refresh registry"}
        </button>
      </section>

      <div className="demo-safety-strip live-provisioning-boundary">
        <AlertCircle aria-hidden="true" size={17} />
        <span><strong>Blank branded shell only.</strong> Owner activation, room and tenant imports, UPI and operating rules, and integrations remain pending after this step.</span>
      </div>

      <section className="operator-metric-grid" aria-label="Provisioning summary">
        <article>
          <span><Layers3 size={19} /></span>
          <div><small>Current template</small><strong>{templateVersion ? "v" + templateVersion : "—"}</strong><p>Blank template; no demo records</p></div>
        </article>
        <article>
          <span><Building2 size={19} /></span>
          <div><small>Persisted PGs</small><strong>{registryLoading ? "—" : organizations.length}</strong><p>Loaded from the production registry</p></div>
        </article>
        <article>
          <span><Database size={19} /></span>
          <div><small>Initial data</small><strong>Blank</strong><p>Property shell and branding only</p></div>
        </article>
        <article>
          <span><ShieldCheck size={19} /></span>
          <div><small>Persistence</small><strong>Connected</strong><p>Operator authorization required</p></div>
        </article>
      </section>

      <section className="operator-grid live-operator-grid">
        <article className="panel live-provision-panel">
          <div className="panel-head">
            <div><span className="eyebrow">New organization</span><h2>Create a branded PG shell</h2><p>The hostname and empty property record are created through the protected provisioning API.</p></div>
          </div>

          <form className="modal-form live-provision-form" onSubmit={provisionShell} aria-busy={submitting}>
            <label htmlFor="provision-name">
              Organization name
              <input
                id="provision-name"
                name="name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                minLength={2}
                maxLength={120}
                required
                disabled={submitting}
              />
            </label>
            <div className="form-row">
              <label htmlFor="provision-slug">
                Workspace slug
                <input
                  id="provision-slug"
                  name="slug"
                  value={form.slug}
                  onChange={(event) => updateField("slug", event.target.value.toLowerCase())}
                  pattern="[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?"
                  title="Use lowercase letters, numbers, and internal hyphens."
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  disabled={submitting}
                />
              </label>
              <label htmlFor="provision-property-name">
                Property name
                <input
                  id="provision-property-name"
                  name="propertyName"
                  value={form.propertyName}
                  onChange={(event) => updateField("propertyName", event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                  disabled={submitting}
                />
              </label>
            </div>
            <div className="form-row live-color-row">
              <label htmlFor="provision-primary-color">
                Primary color
                <span className="live-color-control">
                  <input
                    id="provision-primary-color"
                    name="primaryColor"
                    type="color"
                    value={form.primaryColor}
                    onChange={(event) => updateField("primaryColor", event.target.value)}
                    required
                    disabled={submitting}
                  />
                  <code>{form.primaryColor}</code>
                </span>
              </label>
              <label htmlFor="provision-accent-color">
                Accent color
                <span className="live-color-control">
                  <input
                    id="provision-accent-color"
                    name="accentColor"
                    type="color"
                    value={form.accentColor}
                    onChange={(event) => updateField("accentColor", event.target.value)}
                    required
                    disabled={submitting}
                  />
                  <code>{form.accentColor}</code>
                </span>
              </label>
            </div>

            {feedback && (
              <div
                className={"live-operator-feedback feedback-" + feedback.tone}
                role={feedback.tone === "error" ? "alert" : "status"}
                aria-live={feedback.tone === "error" ? "assertive" : "polite"}
              >
                {feedback.tone === "success" ? <Check size={17} /> : feedback.tone === "error" ? <AlertCircle size={17} /> : <RefreshCcw className="spin" size={17} />}
                <span>{feedback.message}</span>
              </div>
            )}

            <button className="button button-primary button-full" type="submit" disabled={submitting}>
              <Plus size={17} />
              {submitting ? "Creating blank shell…" : "Create blank PG shell"}
            </button>
          </form>
        </article>

        <article className="panel live-readiness-panel">
          <div className="panel-head"><div><span className="eyebrow">Handoff boundary</span><h2>What this step does</h2></div></div>
          <div className="blueprint-checks live-boundary-list">
            <span><Check size={15} /> Creates one persisted organization</span>
            <span><Check size={15} /> Creates its initial property shell</span>
            <span><Check size={15} /> Applies the selected brand colors</span>
            <span><Check size={15} /> Reserves its platform hostname</span>
          </div>
          <div className="health-list">
            <div><span className="health-icon"><AlertCircle size={17} /></span><span><strong>Owner access</strong><small>Activation remains pending</small></span><StatusPill tone="warning">Pending</StatusPill></div>
            <div><span className="health-icon"><Building2 size={17} /></span><span><strong>Rooms and tenants</strong><small>Validated imports remain pending</small></span><StatusPill tone="warning">Pending</StatusPill></div>
            <div><span className="health-icon"><Database size={17} /></span><span><strong>Rules and integrations</strong><small>UPI, operations, and providers remain pending</small></span><StatusPill tone="warning">Pending</StatusPill></div>
          </div>
        </article>
      </section>

      <OwnerInvitationPanel organizations={organizations} onPrepared={() => loadRegistry()} />
      <OperatorPasswordCard />
      <OwnerRecoveryPanel organizations={organizations} />

      <section className="panel live-domain-panel">
        <div className="panel-head"><div><span className="eyebrow">Custom domains</span><h2>Domain verification</h2></div></div>
        <form className="modal-form" onSubmit={initiateCustomDomain} aria-busy={domainSubmitting}>
          <div className="form-row">
            <label htmlFor="domain-org-id">
              Organization
              <select id="domain-org-id" value={domainOrgId} onChange={(e) => { setDomainOrgId(e.target.value); setDomainChallenge(null); setDomainVerified(null); setDomainError(null); }} disabled={domainSubmitting} required>
                <option value="">Select organization</option>
                {organizations.map((org) => <option key={org.id} value={org.id}>{org.name} ({org.slug})</option>)}
              </select>
            </label>
            <label htmlFor="domain-hostname">
              Custom domain
              <input id="domain-hostname" value={domainHostname} onChange={(e) => { setDomainHostname(e.target.value); setDomainChallenge(null); setDomainVerified(null); setDomainError(null); }} placeholder="nivasastay.com" autoCapitalize="none" spellCheck={false} required disabled={domainSubmitting} />
            </label>
          </div>
          <button className="button button-secondary button-full" type="submit" disabled={domainSubmitting || !domainOrgId || !domainHostname}>
            <Globe size={17} />{domainSubmitting ? "Generating challenge…" : "Generate DNS challenge"}
          </button>
        </form>

        {domainChallenge && domainTxtRecord && (
          <div className="domain-challenge-result">
            <div className="password-security-note"><ShieldCheck size={17} /><span>Add this TXT record to your domain&apos;s DNS settings.</span></div>
            <label>TXT Record Value<input value={domainTxtRecord} readOnly onFocus={(e) => e.currentTarget.select()} /></label>
            <button className="button button-primary button-full" type="button" onClick={checkCustomDomain} disabled={domainSubmitting || !domainMappingId}>
              <RefreshCcw className={domainSubmitting ? "spin" : ""} size={17} />{domainSubmitting ? "Checking DNS…" : "Verify now"}
            </button>
            {domainVerified === true && <div className="live-operator-feedback feedback-success" role="status"><Check size={17} /><span>Domain verified. Traffic will now resolve to this PG.</span></div>}
            {domainVerified === false && <div className="live-operator-feedback feedback-error" role="status"><AlertCircle size={17} /><span>TXT record not found. Add the record and try again.</span></div>}
          </div>
        )}
        {domainError && <div className="live-operator-feedback feedback-error" role="alert"><AlertCircle size={17} /><span>{domainError}</span></div>}
      </section>

      <section className="panel organizations-panel live-organizations-panel">
        <div className="panel-head panel-head-wrap">
          <div><span className="eyebrow">Persisted organizations</span><h2>Provisioning registry</h2><p>Only records returned by the protected provisioning API appear here.</p></div>
          {templateVersion && <StatusPill tone="info">Template v{templateVersion}</StatusPill>}
        </div>

        {registryLoading && !registry ? (
          <div className="live-registry-empty" role="status"><RefreshCcw className="spin" size={18} /> Loading persisted PGs…</div>
        ) : registryError ? (
          <div className="live-registry-empty live-registry-error" role="alert">
            <AlertCircle size={18} />
            <span>{registryError}</span>
            <button className="button button-quiet" type="button" onClick={() => void loadRegistry()}>Try again</button>
          </div>
        ) : organizations.length === 0 ? (
          <div className="live-registry-empty">
            <Building2 size={20} />
            <span><strong>No PG shells yet.</strong> Create the first blank organization with the form above.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table organizations-table">
              <thead><tr><th>Organization</th><th>Hostname</th><th>Owner access</th><th>Provisioning</th><th>Organization state</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {organizations.map((organization) => {
                  const provisioningState = organization.provisioning?.state ?? "not_started";
                  const invitation = organization.ownerInvitation;
                  const invitationState = ownerAccessState(invitation);
                  const credentialExpiry = invitationState === "activated"
                    ? null
                    : invitation?.temporaryPasswordExpiresAt ?? invitation?.expiresAt;
                  return (
                    <tr key={organization.id}>
                      <td>
                        <div className="property-cell">
                          <span>{organization.name.slice(0, 2).toUpperCase()}</span>
                          <div><strong>{organization.name}</strong><small>{organization.slug}</small></div>
                        </div>
                      </td>
                      <td><strong>{organization.hostname ?? "Not assigned"}</strong><small>{organization.hostname ? "Platform hostname" : "Hostname pending"}</small></td>
                      <td>
                        <StatusPill tone={stateTone(invitationState)}>{stateLabel(invitationState)}</StatusPill>
                        {invitation && <small>{invitation.displayName} · {invitation.maskedPhone}</small>}
                        {credentialExpiry && (
                          <small>
                            {invitationState === "temporary_password_expired" ? "Expired " : "Expires "}
                            {formatCreatedAt(credentialExpiry)}
                          </small>
                        )}
                      </td>
                      <td><StatusPill tone={stateTone(provisioningState)}>{stateLabel(provisioningState)}</StatusPill>{organization.provisioning && <small>{organization.provisioning.jobId}</small>}</td>
                      <td><StatusPill tone={stateTone(organization.state)}>{stateLabel(organization.state)}</StatusPill></td>
                      <td><time dateTime={organization.createdAt}>{formatCreatedAt(organization.createdAt)}</time></td>
                      <td>
                        {organization.state === "draft" ? (
                          <button
                            className="button button-danger-quiet organization-delete-button"
                            type="button"
                            onClick={() => openDeleteDialog(organization)}
                          >
                            <Trash2 aria-hidden="true" size={15} />
                            Delete draft
                          </button>
                        ) : <span className="organization-action-unavailable">Not deletable</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {deleteTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && closeDeleteDialog()}
        >
          <section
            className="modal-card delete-draft-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-draft-title"
            aria-describedby="delete-draft-description"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow delete-draft-eyebrow">Permanent action</span>
                <h2 id="delete-draft-title">Delete {deleteTarget.name}?</h2>
                <p id="delete-draft-description">This permanently removes the blank draft, its owner login, hostname, branding, invitation, and provisioning history. It cannot be undone.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close delete draft dialog"
                onClick={closeDeleteDialog}
                disabled={deleting}
              >
                <X aria-hidden="true" size={19} />
              </button>
            </div>

            <div className="delete-draft-warning">
              <AlertCircle aria-hidden="true" size={18} />
              <span><strong>Only blank onboarding drafts are eligible.</strong> One unshared onboarding owner is allowed; the server refuses operational data, shared identities, or platform operators.</span>
            </div>

            <form className="modal-form" onSubmit={deleteDraftOrganization} aria-busy={deleting}>
              <label htmlFor="delete-draft-slug">
                Type <code>{deleteTarget.slug}</code> to confirm
                <input
                  id="delete-draft-slug"
                  value={deleteSlug}
                  onChange={(event) => {
                    setDeleteSlug(event.target.value.toLowerCase());
                    setDeleteError(null);
                  }}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  disabled={deleting}
                />
              </label>

              <label htmlFor="delete-draft-operator-password">
                Confirm your current operator password
                <span className="delete-password-control">
                  <input
                    id="delete-draft-operator-password"
                    type={showDeletePassword ? "text" : "password"}
                    value={deleteOperatorPassword}
                    onChange={(event) => {
                      setDeleteOperatorPassword(event.target.value);
                      setDeleteError(null);
                    }}
                    minLength={8}
                    maxLength={128}
                    autoComplete="current-password"
                    required
                    disabled={deleting}
                  />
                  <button
                    type="button"
                    aria-label={showDeletePassword ? "Hide operator password" : "Show operator password"}
                    onClick={() => setShowDeletePassword((current) => !current)}
                    disabled={deleting}
                  >
                    {showDeletePassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                  </button>
                </span>
                <small>Your password is verified securely and is never stored by PGFlow.</small>
              </label>

              {deleteError && <div className="live-operator-feedback feedback-error" role="alert"><AlertCircle size={17} /><span>{deleteError}</span></div>}

              <button
                className="button button-danger button-full"
                type="submit"
                disabled={
                  deleting
                  || deleteSlug !== deleteTarget.slug
                  || deleteOperatorPassword.length < 8
                }
              >
                {deleting ? <RefreshCcw className="spin" size={17} /> : <Trash2 size={17} />}
                {deleting ? "Deleting empty draftâ€¦" : "Permanently delete draft"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
