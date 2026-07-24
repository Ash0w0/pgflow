"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Database,
  Globe2,
  Layers3,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { provisionedProperties } from "@/lib/demo-data";
import { StatusPill } from "./status-pill";

const steps = ["Organization", "Branding", "Property data", "Owner account", "UPI & rules", "Smoke tests"];

export function OperatorConsole() {
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!resetting) return;
    const timer = window.setTimeout(() => setResetting(false), 1200);
    return () => window.clearTimeout(timer);
  }, [resetting]);

  useEffect(() => {
    if (!provisionOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProvisionOpen(false);
        setActiveStep(0);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [provisionOpen]);

  function resetDemo() {
    setResetting(true);
  }

  function openProvisioningPreview() {
    setActiveStep(0);
    setProvisionOpen(true);
  }

  function closeProvisioningPreview() {
    setProvisionOpen(false);
    setActiveStep(0);
  }

  return (
    <MotionConfig reducedMotion="user"><div className="operator-page page-stack">
      <section className="page-heading">
        <div><div className="demo-kicker"><ShieldCheck size={14} /> Fictional operator UI preview</div><h1>Template operations</h1><p>Explore the intended provisioning workflow. This public preview does not create or modify organizations.</p></div>
        <div className="heading-actions"><button className="button button-secondary" type="button" onClick={resetDemo}><RefreshCcw className={resetting ? "spin" : ""} size={17} /> Preview reset</button><button className="button button-primary" type="button" onClick={openProvisioningPreview}><Plus size={17} /> Simulate provisioning</button></div>
      </section>

      <section className="operator-metric-grid">
        <article><span><Layers3 size={19} /></span><div><small>Template version</small><strong>v1.0.0</strong><p>Blank blueprint is current</p></div></article>
        <article><span><UsersRound size={19} /></span><div><small>Sample organizations</small><strong>04</strong><p>1 demo · 3 synthetic previews</p></div></article>
        <article><span><Clock3 size={19} /></span><div><small>Automation target</small><strong>&lt; 15m</strong><p>Not yet measured in production</p></div></article>
        <article><span><Activity size={19} /></span><div><small>Environment</small><strong>Demo</strong><p>Live integrations are disabled</p></div></article>
      </section>

      <section className="operator-grid">
        <article className="panel operator-blueprint">
          <div className="panel-head"><div><span className="eyebrow">Master blueprint</span><h2>Blank PG template</h2></div><StatusPill tone="warning">Contract draft</StatusPill></div>
          <div className="blueprint-version"><span><Sparkles size={20} /></span><div><strong>Template 1.0.0</strong><p>26 modules · English + Hindi · 5 preset roles</p></div><button className="icon-button" type="button"><MoreHorizontal size={18} /></button></div>
          <div className="blueprint-checks">
            <span><Check size={15} /> No business records</span>
            <span><Check size={15} /> Versioned defaults</span>
            <span><Check size={15} /> Demo isolated</span>
            <span><Check size={15} /> Idempotent seed</span>
          </div>
          <button className="button button-quiet button-full" type="button"><Copy size={16} /> Inspect template contract</button>
        </article>

        <article className="panel platform-health">
          <div className="panel-head"><div><span className="eyebrow">Capability preview</span><h2>Release boundaries</h2></div><button className="text-button" type="button">View checklist</button></div>
          <div className="health-list">
            <div><span className="health-icon"><Database size={17} /></span><span><strong>Data isolation</strong><small>Schema drafted · penetration tests pending</small></span><StatusPill tone="warning">Unverified</StatusPill></div>
            <div><span className="health-icon"><Globe2 size={17} /></span><span><strong>Domains & PWA</strong><small>Demo manifest · live mapping pending</small></span><StatusPill tone="info">Preview</StatusPill></div>
            <div><span className="health-icon"><ServerCog size={17} /></span><span><strong>WhatsApp Cloud API</strong><small>Webhook contract · no number connected</small></span><StatusPill tone="warning">Disabled</StatusPill></div>
          </div>
        </article>
      </section>

      <section className="panel organizations-panel">
        <div className="panel-head panel-head-wrap"><div><span className="eyebrow">Organizations</span><h2>Provisioning registry</h2><p>The demo is seeded separately. Real PGs always start from the blank template.</p></div><div className="table-tools"><button className="button button-quiet" type="button"><Upload size={16} /> Import workbook</button></div></div>
        <div className="table-wrap">
          <table className="data-table organizations-table">
            <thead><tr><th>Property</th><th>Capacity</th><th>Template</th><th>Domain</th><th>WhatsApp</th><th>Status</th><th /></tr></thead>
            <tbody>
              {provisionedProperties.map((property) => (
                <tr key={property.id}>
                  <td><div className="property-cell"><span style={{ background: property.brand }}>{property.name.slice(0, 2).toUpperCase()}</span><div><strong>{property.name}</strong><small>{property.slug}</small></div></div></td>
                  <td><strong>{property.occupied}/{property.beds}</strong><small>occupied beds</small></td>
                  <td><code>{property.templateVersion}</code></td>
                  <td><strong>{property.domain}</strong><small>{property.domain.endsWith("pgflow.app") ? "Platform subdomain" : "Custom domain"}</small></td>
                  <td><StatusPill tone={property.whatsapp === "connected" ? "success" : property.whatsapp === "simulated" ? "info" : "warning"}>{property.whatsapp}</StatusPill></td>
                  <td><StatusPill tone="info">{property.state === "demo" ? "demo" : `synthetic · ${property.state.replaceAll("_", " ")}`}</StatusPill></td>
                  <td><button aria-label={`Open ${property.name} preview`} className="icon-button" type="button"><ChevronRight size={18} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="operator-grid operator-grid-bottom">
        <article className="panel timeline-panel"><div className="panel-head"><div><span className="eyebrow">Illustrative run</span><h2>Iris Residence · sample timing</h2></div><StatusPill tone="info">Simulation</StatusPill></div><div className="provision-timeline">{steps.map((step, index) => <div key={step}><span><Check size={14} /></span><strong>{step}</strong><small>{index === 0 ? "00:34" : index === 5 ? "01:16" : `01:${12 + index * 8}`}</small></div>)}</div></article>
        <article className="panel sla-panel"><span className="sla-visual"><Clock3 size={26} /></span><span className="eyebrow">Service target</span><h2>Core ready is the intended handoff.</h2><p>The four-hour window starts only after validated inputs. It remains a launch acceptance target until timed production rehearsals pass.</p><div><strong>15 min</strong><small>automation target</small><strong>4 hr</strong><small>handoff target</small></div></article>
      </section>

      <AnimatePresence>
        {provisionOpen && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && closeProvisioningPreview()}>
            <motion.section className="modal-card provision-modal" role="dialog" aria-modal="true" aria-labelledby="provision-preview-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
              <div className="modal-head"><div><span className="eyebrow">Provisioning simulation</span><h2 id="provision-preview-title">Preview a clean organization</h2><p>This walkthrough writes no records and never copies synthetic fixture data.</p></div><button autoFocus aria-label="Close provisioning preview" className="icon-button" type="button" onClick={closeProvisioningPreview}><X size={19} /></button></div>
              <div className="stepper">{steps.map((step, index) => <button type="button" className={index <= activeStep ? "active" : ""} key={step} onClick={() => setActiveStep(index)}><span>{index < activeStep ? <Check size={14} /> : index + 1}</span><small>{step}</small></button>)}</div>
              <form className="modal-form" onSubmit={(event) => { event.preventDefault(); if (activeStep < steps.length - 1) setActiveStep(activeStep + 1); else closeProvisioningPreview(); }}>
                {activeStep === 0 && <><label>PG display name<input defaultValue="Aster House PG" /></label><div className="form-row"><label>Preferred slug<input defaultValue="aster-house" /></label><label>Contract<select><option>Setup + monthly</option><option>Per active bed</option><option>One-time license</option><option>Custom</option></select></label></div></>}
                {activeStep === 1 && <><label>Brand primary color<input defaultValue="#5a46dc" /></label><label className="upload-field"><Upload size={20} /><strong>Upload PG logo</strong><small>PNG or WebP · transparent preferred</small><input type="file" accept="image/png,image/webp" /></label></>}
                {activeStep === 2 && <><label className="upload-field"><Upload size={20} /><strong>Upload validated onboarding workbook</strong><small>Rooms, beds, tenants, deposits and opening dues</small><input type="file" accept=".xlsx,.csv" /></label><div className="modal-note"><CircleDot size={16} /><span>Import is staged and validated before a transactional commit.</span></div></>}
                {activeStep === 3 && <><div className="form-row"><label>Owner name<input defaultValue="Aarav Mehta" /></label><label>Owner phone<input defaultValue="+91 00000 00000" /></label></div><label>Initial role<select><option>PG owner</option></select></label></>}
                {activeStep === 4 && <><label>UPI ID<input defaultValue="asterhouse@upi" /></label><div className="form-row"><label>Rent due day<input defaultValue="5" /></label><label>Electricity mode<select><option>Manual amount</option><option>Flat monthly</option><option>Shared room meter</option><option>Disabled</option></select></label></div></>}
                {activeStep === 5 && <div className="smoke-checks"><span><Check size={17} /> Organization isolation</span><span><Check size={17} /> Hostname resolution</span><span><Check size={17} /> Branding contrast</span><span><Check size={17} /> Billing preview</span><span><Check size={17} /> Owner authorization</span><span><Check size={17} /> PWA manifest</span></div>}
                <button className="button button-primary button-full" type="submit">{activeStep === steps.length - 1 ? "Finish simulation" : "Continue"}<ArrowRight size={17} /></button>
              </form>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div></MotionConfig>
  );
}
