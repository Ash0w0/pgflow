"use client";

import {
  AlertTriangle,
  CircleAlert,
  Eye,
  EyeOff,
  PencilLine,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  validateResidentEditInput,
  type ResidentEditField,
  type ResidentEditFieldErrors,
} from "@/lib/resident-onboarding-validation";
import type { ResidentRegisterRow } from "@/lib/resident-setup-types";

type ResidentManagementDialogProps = {
  resident: ResidentRegisterRow;
  onClose: () => void;
  onComplete: (message: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function ResidentManagementDialog({ resident, onClose, onComplete }: ResidentManagementDialogProps) {
  const [mode, setMode] = useState<"edit" | "undo">("edit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ResidentEditFieldErrors>({});
  const [fullName, setFullName] = useState(resident.fullName);
  const [phone, setPhone] = useState(resident.phone);
  const [alternatePhone, setAlternatePhone] = useState(resident.alternatePhone);
  const [emergencyName, setEmergencyName] = useState(resident.emergencyName);
  const [emergencyPhone, setEmergencyPhone] = useState(resident.emergencyPhone);
  const [address, setAddress] = useState(resident.address);
  const [moveInDate, setMoveInDate] = useState(resident.moveInDate);
  const [monthlyRent, setMonthlyRent] = useState(String(resident.monthlyRent));
  const [depositPromised, setDepositPromised] = useState(String(resident.depositPromised));
  const [confirmationName, setConfirmationName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [undoConfirmed, setUndoConfirmed] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, submitting]);

  function clearFieldError(field: ResidentEditField) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError(null);
  }

  function validationProps(field: ResidentEditField) {
    return {
      "aria-invalid": fieldErrors[field] ? true : undefined,
      "aria-describedby": fieldErrors[field] ? `edit-${field}-error` : undefined,
    };
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const validationErrors = validateResidentEditInput({
      fullName,
      phone,
      alternatePhone,
      emergencyName,
      emergencyPhone,
      address,
      moveInDate,
      monthlyRent,
      depositPromised,
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
      const response = await fetch(`/api/residents/${resident.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          alternatePhone,
          emergencyName,
          emergencyPhone,
          address,
          moveInDate,
          monthlyRent: Number(monthlyRent),
          depositPromised: Number(depositPromised),
          confirmUpdate: true,
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (isRecord(result) && isRecord(result.fieldErrors)) {
          const serverErrors: ResidentEditFieldErrors = {};
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            if (typeof message === "string") serverErrors[field as ResidentEditField] = message;
          }
          setFieldErrors(serverErrors);
        }
        throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "The resident could not be updated.");
      }
      const changedFields = isRecord(result) && isRecord(result.resident) && Array.isArray(result.resident.changedFields)
        ? result.resident.changedFields
        : [];
      onComplete(changedFields.length > 0
        ? `${fullName.trim()} was updated. The correction is recorded in the audit trail.`
        : `No changes were needed for ${fullName.trim()}.`);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The resident could not be updated.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitUndo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (confirmationName !== resident.fullName) {
      setError("Type the resident name exactly as shown.");
      return;
    }
    if (!undoConfirmed) {
      setError("Confirm that this is an empty onboarding mistake.");
      return;
    }
    if (currentPassword.length < 8 || currentPassword.length > 128) {
      setError("Enter your current owner password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/residents/${resident.id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmationName,
          currentPassword,
          confirmEmptyOnboarding: true,
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "The onboarding could not be undone.");
      }
      setCurrentPassword("");
      onComplete(`${resident.fullName}'s empty onboarding was undone and ${resident.bedLabel} is vacant again.`);
    } catch (submissionError) {
      setCurrentPassword("");
      setError(submissionError instanceof Error ? submissionError.message : "The onboarding could not be undone.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="setup-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !submitting && onClose()}>
      <section className="setup-dialog resident-dialog resident-management-dialog" role="dialog" aria-modal="true" aria-labelledby="resident-management-title">
        <header>
          <div>
            <span className="eyebrow">Resident management</span>
            <h2 id="resident-management-title">{mode === "edit" ? "Edit resident" : "Undo empty onboarding"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close resident management" disabled={submitting}><X size={19} /></button>
        </header>

        {mode === "edit" ? (
          <form className="setup-form resident-form" onSubmit={submitEdit} noValidate>
            <div className="resident-management-context"><PencilLine size={17} /><span><strong>{resident.fullName}</strong><small>{resident.floorName} · {resident.roomCode} · {resident.bedLabel}</small></span></div>
            <fieldset>
              <legend>Resident and emergency details</legend>
              <div className="setup-form-grid">
                <label>Full name<input {...validationProps("fullName")} value={fullName} onChange={(event) => { setFullName(event.target.value); clearFieldError("fullName"); }} disabled={submitting} />{fieldErrors.fullName && <small className="resident-field-error" id="edit-fullName-error">{fieldErrors.fullName}</small>}</label>
                <label>Phone number<input {...validationProps("phone")} type="tel" inputMode="tel" value={phone} onChange={(event) => { setPhone(event.target.value); clearFieldError("phone"); }} disabled={submitting} />{fieldErrors.phone && <small className="resident-field-error" id="edit-phone-error">{fieldErrors.phone}</small>}</label>
                <label>Alternate phone <small>Optional</small><input {...validationProps("alternatePhone")} type="tel" inputMode="tel" value={alternatePhone} onChange={(event) => { setAlternatePhone(event.target.value); clearFieldError("alternatePhone"); }} disabled={submitting} />{fieldErrors.alternatePhone && <small className="resident-field-error" id="edit-alternatePhone-error">{fieldErrors.alternatePhone}</small>}</label>
                <label>Address <small>Optional</small><input {...validationProps("address")} value={address} onChange={(event) => { setAddress(event.target.value); clearFieldError("address"); }} disabled={submitting} />{fieldErrors.address && <small className="resident-field-error" id="edit-address-error">{fieldErrors.address}</small>}</label>
                <label>Emergency contact<input {...validationProps("emergencyName")} value={emergencyName} onChange={(event) => { setEmergencyName(event.target.value); clearFieldError("emergencyName"); }} disabled={submitting} />{fieldErrors.emergencyName && <small className="resident-field-error" id="edit-emergencyName-error">{fieldErrors.emergencyName}</small>}</label>
                <label>Emergency phone<input {...validationProps("emergencyPhone")} type="tel" inputMode="tel" value={emergencyPhone} onChange={(event) => { setEmergencyPhone(event.target.value); clearFieldError("emergencyPhone"); }} disabled={submitting} />{fieldErrors.emergencyPhone && <small className="resident-field-error" id="edit-emergencyPhone-error">{fieldErrors.emergencyPhone}</small>}</label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Current occupancy terms</legend>
              <div className="setup-form-grid">
                <label>Move-in date<input {...validationProps("moveInDate")} type="date" value={moveInDate} onChange={(event) => { setMoveInDate(event.target.value); clearFieldError("moveInDate"); }} disabled={submitting} />{fieldErrors.moveInDate && <small className="resident-field-error" id="edit-moveInDate-error">{fieldErrors.moveInDate}</small>}</label>
                <label>Monthly rent<input {...validationProps("monthlyRent")} type="number" inputMode="numeric" min="0" max="10000000" value={monthlyRent} onChange={(event) => { setMonthlyRent(event.target.value); clearFieldError("monthlyRent"); }} disabled={submitting} />{fieldErrors.monthlyRent && <small className="resident-field-error" id="edit-monthlyRent-error">{fieldErrors.monthlyRent}</small>}</label>
                <label>Deposit promised<input {...validationProps("depositPromised")} type="number" inputMode="numeric" min="0" max="10000000" value={depositPromised} onChange={(event) => { setDepositPromised(event.target.value); clearFieldError("depositPromised"); }} disabled={submitting} /><small>This still does not record a deposit payment.</small>{fieldErrors.depositPromised && <small className="resident-field-error" id="edit-depositPromised-error">{fieldErrors.depositPromised}</small>}</label>
              </div>
            </fieldset>
            {error && <p className="setup-form-error" role="alert"><CircleAlert size={16} />{error}</p>}
            <button className="button button-primary button-full" type="submit" disabled={submitting}><Save size={16} />{submitting ? "Saving correction…" : "Save audited correction"}</button>
            <section className="resident-undo-entry">
              <div><ShieldAlert size={18} /><span><strong>Onboarding mistake?</strong><small>Only an empty resident created within the last 24 hours can be undone.</small></span></div>
              <button className="text-button danger" type="button" onClick={() => { setMode("undo"); setError(null); }} disabled={submitting}>Review undo rules</button>
            </section>
          </form>
        ) : (
          <form className="setup-form resident-undo-form" onSubmit={submitUndo} noValidate>
            <div className="resident-danger-callout"><AlertTriangle size={21} /><div><strong>This removes an empty onboarding record.</strong><p>It is allowed only within 24 hours and only when no login, invoice, or payment exists. The bed returns to vacant and the undo remains audited.</p></div></div>
            <div className="resident-undo-checks" aria-label="Undo safety requirements">
              <span>✓ Owner password required</span><span>✓ Exact name required</span><span>✓ Financial activity blocked</span><span>✓ Permanent audit retained</span>
            </div>
            <label>Type <strong>{resident.fullName}</strong> exactly<input value={confirmationName} onChange={(event) => { setConfirmationName(event.target.value); setError(null); }} autoComplete="off" disabled={submitting} /></label>
            <label>Current owner password<div className="resident-password-input"><input type={showPassword ? "text" : "password"} value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setError(null); }} autoComplete="current-password" disabled={submitting} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide current password" : "Show current password"} disabled={submitting}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            <label className="resident-confirmation resident-danger-confirmation"><input type="checkbox" checked={undoConfirmed} onChange={(event) => { setUndoConfirmed(event.target.checked); setError(null); }} disabled={submitting} /><span><strong>I confirm this is an onboarding mistake with no real activity.</strong><small>If activity exists, the server will refuse this action.</small></span></label>
            {error && <p className="setup-form-error" role="alert"><CircleAlert size={16} />{error}</p>}
            <div className="resident-undo-actions">
              <button className="button button-secondary" type="button" onClick={() => { setMode("edit"); setError(null); setCurrentPassword(""); }} disabled={submitting}>Back to edit</button>
              <button className="button button-danger" type="submit" disabled={submitting || confirmationName !== resident.fullName || !undoConfirmed || currentPassword.length < 8}><Trash2 size={16} />{submitting ? "Verifying and undoing…" : "Undo empty onboarding"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
