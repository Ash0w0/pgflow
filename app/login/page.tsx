"use client";

import Link from "next/link";
import { ArrowRight, Eye, LockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { BrandMark, PoweredBy } from "@/components/brand-mark";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <BrandMark />
        <div><span className="demo-kicker">Fictional demonstration</span><h1>Your PG,<br /><em>beautifully run.</em></h1><p>Rent, rooms and resident operations—kept in flow through one branded workspace and WhatsApp.</p></div>
        <div className="login-proof"><ShieldCheck size={20} /><span><strong>Demo-safe by design</strong><small>No real resident or payment data</small></span></div>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap"><span className="eyebrow">Welcome back</span><h2>Sign in to Nivasa</h2><p>Use a fictional role below to explore the template.</p><form><label>Phone number<div className="input-with-icon"><Phone size={17} /><input defaultValue="+91 00000 00000" /></div></label><label>Password<div className="input-with-icon"><LockKeyhole size={17} /><input defaultValue="Demo@2026" type="password" /><Eye size={17} /></div></label><div className="login-options"><label><input defaultChecked type="checkbox" /> Keep me signed in</label><button type="button">Forgot password?</button></div><Link className="button button-primary button-full" href="/">Sign in to demo <ArrowRight size={17} /></Link></form><div className="role-shortcuts"><span>Or explore as</span><div><Link href="/">Owner</Link><Link href="/tenant">Tenant</Link><Link href="/operator">Operator</Link></div></div><PoweredBy /></div>
      </section>
    </main>
  );
}
