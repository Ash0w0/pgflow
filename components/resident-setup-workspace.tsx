"use client";

import { useRouter } from "next/navigation";
import {
  BedDouble,
  CheckCircle2,
  CircleAlert,
  ContactRound,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  validateResidentOnboardingInput,
  type ResidentOnboardingField,
  type ResidentOnboardingFieldErrors,
} from "@/lib/resident-onboarding-validation";
import type { ResidentRegisterRow, ResidentSetupData } from "@/lib/resident-setup-types";
import { AppShell } from "./app-shell";
import { ResidentManagementDialog } from "./resident-management-dialog";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function maskPhone(phone: string) {
  return /^\+91[6-9]\d{9}$/.test(phone) ? `${phone.slice(0, 3)} •••••• ${phone.slice(-4)}` : "Phone unavailable";
}

function displayDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(timestamp)
    : value;
}

export function ResidentSetupWorkspace({ data, demoMode }: { data: ResidentSetupData; demoMode: boolean }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ResidentOnboardingFieldErrors>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bedId, setBedId] = useState(data.availableBeds[0]?.id ?? "");
  const [moveInDate, setMoveInDate] = useState("");
  const [monthlyRent, setMonthlyRent] = useState(String(data.availableBeds[0]?.defaultRent ?? ""));
  const [depositPromised, setDepositPromised] = useState("0");
  const [openingDue, setOpeningDue] = useState("0");
  const [confirmed, setConfirmed] = useState(false);
  const [managedResident, setManagedResident] = useState<ResidentRegisterRow | null>(null);
  const residentLimitReached = data.residents.length >= data.residentLimit;
  const upgradeNumber = (process.env.NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const upgradeHref = /^\d{10,15}$/.test(upgradeNumber)
    ? `https://wa.me/${upgradeNumber}?text=${encodeURIComponent("Hi PGFlow, I have reached my resident limit and want to upgrade my PG workspace.")}`
    : null;

  const selectedBedId = data.availableBeds.some((bed) => bed.id === bedId)
    ? bedId
    : data.availableBeds[0]?.id ?? "";

  useEffect(() => {
    if (!dialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setDialogOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [dialogOpen, submitting]);

  function resetForm() {
    const firstBed = data.availableBeds[0];
    setFullName("");
    setPhone("");
    setAlternatePhone("");
    setEmergencyName("");
    setEmergencyPhone("");
    setAddress("");
    setBedId(firstBed?.id ?? "");
    setMoveInDate("");
    setMonthlyRent(String(firstBed?.defaultRent ?? ""));
    setDepositPromised("0");
    setOpeningDue("0");
    setConfirmed(false);
    setError(null);
    setFieldErrors({});
  }

  function openDialog() {
    if (residentLimitReached) return;
    resetForm();
    setSuccess(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (submitting) return;
    setDialogOpen(false);
    setError(null);
  }

  function completeManagement(message: string) {
    setManagedResident(null);
    setSuccess(message);
    router.refresh();
  }

  function selectBed(nextBedId: string) {
    const bed = data.availableBeds.find((candidate) => candidate.id === nextBedId);
    setBedId(nextBedId);
    clearFieldError("bedId");
    if (bed) setMonthlyRent(String(bed.defaultRent));
  }

  function clearFieldError(field: ResidentOnboardingField) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError(null);
  }

  function validationProps(field: ResidentOnboardingField) {
    return {
      "aria-invalid": fieldErrors[field] ? true : undefined,
      "aria-describedby": fieldErrors[field] ? `${field}-error` : undefined,
    };
  }

  async function onboardResident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const validationErrors = validateResidentOnboardingInput({
      fullName,
      phone,
      alternatePhone,
      emergencyName,
      emergencyPhone,
      address,
      bedId: selectedBedId,
      moveInDate,
      monthlyRent,
      depositPromised,
      openingDue,
      confirmAssignment: confirmed,
    });
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError("Please correct the highlighted fields.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/residents/onboard", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          alternatePhone,
          emergencyName,
          emergencyPhone,
          address,
          bedId: selectedBedId,
          moveInDate,
          monthlyRent: Number(monthlyRent),
          depositPromised: Number(depositPromised),
          openingDue: Number(openingDue),
          confirmAssignment: confirmed,
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (isRecord(result) && isRecord(result.fieldErrors)) {
          const serverFieldErrors: ResidentOnboardingFieldErrors = {};
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            if (typeof message === "string") serverFieldErrors[field as ResidentOnboardingField] = message;
          }
          setFieldErrors(serverFieldErrors);
        }
        throw new Error(isRecord(result) && typeof result.error === "string"
          ? result.error
          : "The resident could not be onboarded.");
      }

      const residentName = fullName.trim();
      setDialogOpen(false);
      setSuccess(`${residentName} was onboarded and the bed is now occupied.`);
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The resident could not be onboarded.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell demoMode={demoMode}>
      <div className="page-stack resident-setup-page">
        <section className="page-heading resident-setup-heading">
          <div>
            <div className="demo-kicker"><Sparkles size={14} /> Residents</div>
            <h1>Residents</h1>
            <p>Onboard residents, assign beds, and set opening balances.</p>
          </div>
          <button
            className="button button-primary"
            type="button"
            onClick={openDialog}
            disabled={data.availableBeds.length === 0 || residentLimitReached}
            title={residentLimitReached ? "Contact PGFlow to upgrade your resident limit" : data.availableBeds.length === 0 ? "Create or free a vacant bed first" : undefined}
          >
            <UserPlus size={17} /> Add resident
          </button>
        </section>

        <div className="setup-safety-strip">
          <ShieldCheck size={17} />
          <span><strong>One resident, one active bed.</strong> {data.residentLimit >= 100000 ? `${data.residents.length} residents.` : `${data.residents.length} of ${data.residentLimit} resident slots in use.`} Records are audited.</span>
        </div>

        {residentLimitReached && (
          <div className="resident-limit-strip" role="status">
            <MessageCircle size={18} />
            <span><strong>Your current resident limit is {data.residentLimit}.</strong> Contact PGFlow on WhatsApp before adding another resident.</span>
            {upgradeHref
              ? <a href={upgradeHref} target="_blank" rel="noreferrer">Request upgrade</a>
              : <span>Ask PGFlow support to upgrade</span>}
          </div>
        )}

        {success && <div className="setup-feedback success" role="status"><CheckCircle2 size={17} />{success}</div>}

        <section className="workspace-stat-grid" aria-label="Resident summary">
          <article className="metric-card"><span className="eyebrow">Active residents</span><strong>{data.totals.activeResidents}</strong><p>{data.totals.noticeResidents} in notice period</p></article>
          <article className="metric-card"><span className="eyebrow">Vacant beds</span><strong>{data.totals.availableBeds}</strong><p>Available for onboarding</p></article>
          <article className="metric-card"><span className="eyebrow">Outstanding</span><strong>{currency.format(data.totals.totalOutstanding)}</strong><p>Issued unpaid balances</p></article>
          <article className="metric-card"><span className="eyebrow">Deposits promised</span><strong>{currency.format(data.totals.depositsPromised)}</strong><p>Not counted as received</p></article>
        </section>

        <section className="panel resident-register-panel">
          <header className="panel-head">
            <div><span className="eyebrow">Live register</span><h2>Current residents</h2><p>Phone numbers are masked in the list. Detailed records will remain permission controlled.</p></div>
            <span className="resident-count"><Users size={16} /> {data.residents.length} total</span>
          </header>

          {data.residents.length === 0 ? (
            <div className="resident-empty-state">
              <span><ContactRound size={27} /></span>
              <div><strong>No residents yet</strong><p>Your first resident can be assigned to {data.availableBeds.length} available {data.availableBeds.length === 1 ? "bed" : "beds"}.</p></div>
              <button className="button button-primary" type="button" onClick={openDialog} disabled={data.availableBeds.length === 0 || residentLimitReached}><Plus size={16} /> Add first resident</button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table resident-table">
                <thead><tr><th>Resident</th><th>Bed</th><th>Move-in</th><th>Monthly rent</th><th>Outstanding</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{data.residents.map((resident) => (
                  <tr key={resident.id}>
                    <td><div className="resident-identity"><span>{resident.fullName.slice(0, 1).toUpperCase()}</span><div><strong>{resident.fullName}</strong><small>{maskPhone(resident.phone)}</small></div></div></td>
                    <td><strong>{resident.roomCode} · {resident.bedLabel}</strong><small>{resident.floorName}</small></td>
                    <td><strong>{displayDate(resident.moveInDate)}</strong></td>
                    <td><strong>{currency.format(resident.monthlyRent)}</strong><small>Deposit {currency.format(resident.depositPromised)}</small></td>
                    <td><strong className={resident.outstanding > 0 ? "amount-due" : "amount-clear"}>{currency.format(resident.outstanding)}</strong></td>
                    <td><span className={`resident-state ${resident.state}`}>{resident.state === "notice" ? "Notice period" : "Active"}</span></td>
                    <td><button className="resident-manage-button" type="button" onClick={() => { setSuccess(null); setManagedResident(resident); }}><SlidersHorizontal size={14} /> Manage</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {dialogOpen && (
        <div className="setup-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
          <section className="setup-dialog resident-dialog" role="dialog" aria-modal="true" aria-labelledby="resident-dialog-title">
            <header>
              <div><span className="eyebrow">Verified onboarding</span><h2 id="resident-dialog-title">Add a resident</h2></div>
              <button className="icon-button" type="button" onClick={closeDialog} aria-label="Close resident form" disabled={submitting}><X size={19} /></button>
            </header>

            <form className="setup-form resident-form" onSubmit={onboardResident} noValidate>
              <fieldset>
                <legend><ContactRound size={16} /> Resident details</legend>
                <div className="setup-form-grid">
                  <label>Full name<input {...validationProps("fullName")} value={fullName} onChange={(event) => { setFullName(event.target.value); clearFieldError("fullName"); }} minLength={2} maxLength={120} autoComplete="name" autoFocus required disabled={submitting} />{fieldErrors.fullName && <small className="resident-field-error" id="fullName-error">{fieldErrors.fullName}</small>}</label>
                  <label>Phone number<input {...validationProps("phone")} type="tel" inputMode="tel" value={phone} onChange={(event) => { setPhone(event.target.value); clearFieldError("phone"); }} autoComplete="tel" placeholder="10-digit Indian number" required disabled={submitting} />{fieldErrors.phone && <small className="resident-field-error" id="phone-error">{fieldErrors.phone}</small>}</label>
                  <label>Alternate phone <small>Optional</small><input {...validationProps("alternatePhone")} type="tel" inputMode="tel" value={alternatePhone} onChange={(event) => { setAlternatePhone(event.target.value); clearFieldError("alternatePhone"); }} disabled={submitting} />{fieldErrors.alternatePhone && <small className="resident-field-error" id="alternatePhone-error">{fieldErrors.alternatePhone}</small>}</label>
                  <label>Address <small>Optional</small><input {...validationProps("address")} value={address} onChange={(event) => { setAddress(event.target.value); clearFieldError("address"); }} maxLength={500} autoComplete="street-address" disabled={submitting} />{fieldErrors.address && <small className="resident-field-error" id="address-error">{fieldErrors.address}</small>}</label>
                </div>
              </fieldset>

              <fieldset>
                <legend><Phone size={16} /> Emergency contact</legend>
                <div className="setup-form-grid">
                  <label>Contact name<input {...validationProps("emergencyName")} value={emergencyName} onChange={(event) => { setEmergencyName(event.target.value); clearFieldError("emergencyName"); }} minLength={2} maxLength={120} required disabled={submitting} />{fieldErrors.emergencyName && <small className="resident-field-error" id="emergencyName-error">{fieldErrors.emergencyName}</small>}</label>
                  <label>Contact phone<input {...validationProps("emergencyPhone")} type="tel" inputMode="tel" value={emergencyPhone} onChange={(event) => { setEmergencyPhone(event.target.value); clearFieldError("emergencyPhone"); }} required disabled={submitting} />{fieldErrors.emergencyPhone && <small className="resident-field-error" id="emergencyPhone-error">{fieldErrors.emergencyPhone}</small>}</label>
                </div>
              </fieldset>

              <fieldset>
                <legend><BedDouble size={16} /> Bed and finances</legend>
                <div className="setup-form-grid">
                  <label>Vacant bed<select {...validationProps("bedId")} value={selectedBedId} onChange={(event) => selectBed(event.target.value)} required disabled={submitting}>{data.availableBeds.map((bed) => <option value={bed.id} key={bed.id}>{bed.floorName} · {bed.roomCode} · {bed.bedLabel}</option>)}</select>{fieldErrors.bedId && <small className="resident-field-error" id="bedId-error">{fieldErrors.bedId}</small>}</label>
                  <label>Move-in date<input {...validationProps("moveInDate")} type="date" value={moveInDate} onChange={(event) => { setMoveInDate(event.target.value); clearFieldError("moveInDate"); }} min="2000-01-01" required disabled={submitting} />{fieldErrors.moveInDate && <small className="resident-field-error" id="moveInDate-error">{fieldErrors.moveInDate}</small>}</label>
                  <label>Monthly rent<input {...validationProps("monthlyRent")} type="number" inputMode="numeric" min="0" max="10000000" value={monthlyRent} onChange={(event) => { setMonthlyRent(event.target.value); clearFieldError("monthlyRent"); }} required disabled={submitting} />{fieldErrors.monthlyRent && <small className="resident-field-error" id="monthlyRent-error">{fieldErrors.monthlyRent}</small>}</label>
                  <label>Deposit promised<input {...validationProps("depositPromised")} type="number" inputMode="numeric" min="0" max="10000000" value={depositPromised} onChange={(event) => { setDepositPromised(event.target.value); clearFieldError("depositPromised"); }} required disabled={submitting} /><small>This does not mark the deposit as received.</small>{fieldErrors.depositPromised && <small className="resident-field-error" id="depositPromised-error">{fieldErrors.depositPromised}</small>}</label>
                  <label>Existing opening due<input {...validationProps("openingDue")} type="number" inputMode="numeric" min="0" max="10000000" value={openingDue} onChange={(event) => { setOpeningDue(event.target.value); clearFieldError("openingDue"); }} required disabled={submitting} /><small>Creates an issued opening-balance invoice.</small>{fieldErrors.openingDue && <small className="resident-field-error" id="openingDue-error">{fieldErrors.openingDue}</small>}</label>
                </div>
              </fieldset>

              <label className="resident-confirmation">
                <input {...validationProps("confirmAssignment")} type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); clearFieldError("confirmAssignment"); }} required disabled={submitting} />
                <span><strong>I verified the resident, bed and opening amounts.</strong><small>This will immediately mark the selected bed occupied.</small></span>
                {fieldErrors.confirmAssignment && <small className="resident-field-error" id="confirmAssignment-error">{fieldErrors.confirmAssignment}</small>}
              </label>

              <div className="resident-transaction-note"><WalletCards size={17} /><span><strong>No payment is recorded here.</strong><small>UPI and cash receipts require their separate reviewed workflows.</small></span></div>
              {error && <p className="setup-form-error" role="alert"><CircleAlert size={16} />{error}</p>}
              <button className="button button-primary button-full" type="submit" disabled={submitting}>{submitting ? "Onboarding resident…" : "Onboard resident and occupy bed"}</button>
            </form>
          </section>
        </div>
      )}
      {managedResident && (
        <ResidentManagementDialog
          resident={managedResident}
          onClose={() => setManagedResident(null)}
          onComplete={completeManagement}
        />
      )}
    </AppShell>
  );
}
