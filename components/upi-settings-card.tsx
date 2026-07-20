"use client";

import { CheckCircle2, Eye, EyeOff, QrCode, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

export function UpiSettingsCard({ initial }: { initial: { upiId: string; payeeName: string; notePrefix: string; hasUploadedQr: boolean } }) {
  const [upiId, setUpiId] = useState(initial.upiId);
  const [payeeName, setPayeeName] = useState(initial.payeeName);
  const [notePrefix, setNotePrefix] = useState(initial.notePrefix || "RENT");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [qrFile,setQrFile]=useState<File|null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(null); setSaved(false);
    try {
      let qrObjectKey="";
      if(qrFile){const form=new FormData();form.set("file",qrFile);const upload=await fetch("/api/uploads/upi-qr",{method:"POST",credentials:"same-origin",body:form});const uploaded:unknown=await upload.json().catch(()=>null);if(!upload.ok||!isRecord(uploaded)||typeof uploaded.objectKey!=="string")throw new Error(isRecord(uploaded)&&typeof uploaded.error==="string"?uploaded.error:"UPI QR upload failed.");qrObjectKey=uploaded.objectKey;}
      const response = await fetch("/api/settings/upi", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ upiId, payeeName, notePrefix, currentPassword: password, qrObjectKey }) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "UPI details could not be saved.");
      setPassword("");setQrFile(null); setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "UPI details could not be saved."); setPassword(""); }
    finally { setSubmitting(false); }
  }
  return <section className="panel upi-settings-card" aria-labelledby="upi-settings-title">
    <div className="panel-head"><div><span className="eyebrow">Direct payment destination</span><h2 id="upi-settings-title">PG-owned UPI</h2><p>Tenant payments go directly to this UPI ID. PGFlow never holds the money.</p></div><span className="owner-invite-icon"><QrCode size={19}/></span></div>
    <form className="modal-form" onSubmit={submit}>
      <div className="form-row"><label>UPI ID<input value={upiId} onChange={e=>setUpiId(e.target.value)} placeholder="yourpg@bank" autoComplete="off" required disabled={submitting}/></label><label>Payee display name<input value={payeeName} onChange={e=>setPayeeName(e.target.value)} maxLength={120} required disabled={submitting}/></label></div>
      <label>Payment note prefix<input value={notePrefix} onChange={e=>setNotePrefix(e.target.value.toUpperCase())} maxLength={20} required disabled={submitting}/><small>Used in the unique invoice reference, for example RENT-INV-0726.</small></label>
      <label>Existing UPI QR <small>Optional</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setQrFile(e.target.files?.[0]??null)} disabled={submitting}/><small>{initial.hasUploadedQr?"A PG QR is already stored. Choose a new image only to replace it.":"Upload a PNG, JPEG, or WebP up to 2 MB. The invoice-specific QR will still be shown first."}</small></label>
      <label>Current owner password<div className="resident-password-input"><input type={showPassword?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" minLength={8} maxLength={128} required disabled={submitting}/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?"Hide password":"Show password"}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
      <div className="password-security-note"><ShieldCheck size={17}/><span>Changing the payment destination requires your current password and creates an audit event.</span></div>
      {saved&&<div className="live-operator-feedback feedback-success" role="status"><CheckCircle2 size={17}/>UPI configuration saved.</div>}{error&&<p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary button-full" type="submit" disabled={submitting}>{submitting?"Saving securely…":"Save UPI configuration"}</button>
    </form>
  </section>;
}
