"use client";

import { useState, useEffect } from "react";
import { Palette, CheckCircle2, Sparkles, RefreshCw } from "lucide-react";

export interface ColorPreset {
  id: string;
  name: string;
  primary: string;
  accent: string;
}

export const PRESET_THEMES: ColorPreset[] = [
  { id: "forest", name: "Forest & Lime (Default)", primary: "#123d32", accent: "#d7ff86" },
  { id: "indigo", name: "Royal Indigo", primary: "#3730a3", accent: "#c7d2fe" },
  { id: "emerald", name: "Emerald Mint", primary: "#065f46", accent: "#a7f3d0" },
  { id: "ocean", name: "Ocean Blue", primary: "#0f4c81", accent: "#bae6fd" },
  { id: "crimson", name: "Crimson Coral", primary: "#881337", accent: "#fecdd3" },
  { id: "teal", name: "Teal & Amber", primary: "#115e59", accent: "#fef08a" },
];

export function BrandingSettingsCard() {
  const [primaryColor, setPrimaryColor] = useState("#123d32");
  const [accentColor, setAccentColor] = useState("#d7ff86");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storedPrimary = localStorage.getItem("pgflow_primary_color");
      const storedAccent = localStorage.getItem("pgflow_accent_color");
      if (storedPrimary) setPrimaryColor(storedPrimary);
      if (storedAccent) setAccentColor(storedAccent);
    } catch {}
  }, []);

  function applyPreset(preset: ColorPreset) {
    setPrimaryColor(preset.primary);
    setAccentColor(preset.accent);
  }

  function applyThemeVariables(pColor: string, aColor: string) {
    document.documentElement.style.setProperty("--brand", pColor);
    document.documentElement.style.setProperty("--accent", aColor);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    try {
      applyThemeVariables(primaryColor, accentColor);

      try {
        localStorage.setItem("pgflow_primary_color", primaryColor);
        localStorage.setItem("pgflow_accent_color", accentColor);
      } catch {}

      const res = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryColor, accentColor }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to update branding settings.");
      }

      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving theme.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    applyPreset(PRESET_THEMES[0]);
    applyThemeVariables(PRESET_THEMES[0].primary, PRESET_THEMES[0].accent);
    try {
      localStorage.removeItem("pgflow_primary_color");
      localStorage.removeItem("pgflow_accent_color");
    } catch {}
    setSaved(true);
  }

  return (
    <section className="panel branding-settings-card" aria-labelledby="branding-settings-title">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Workspace Appearance</span>
          <h2 id="branding-settings-title">Color Scheme & Branding</h2>
          <p>Customize the primary color palette and accent highlights for your PG control room.</p>
        </div>
        <span className="owner-invite-icon">
          <Palette size={20} />
        </span>
      </div>

      <form className="modal-form" onSubmit={handleSave}>
        {/* Preset Selection */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Curated Color Palettes
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PRESET_THEMES.map((preset) => {
              const isSelected = primaryColor === preset.primary && accentColor === preset.accent;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex -space-x-1 shrink-0">
                    <span
                      className="w-5 h-5 rounded-full border border-white shadow-xs"
                      style={{ backgroundColor: preset.primary }}
                    />
                    <span
                      className="w-5 h-5 rounded-full border border-white shadow-xs"
                      style={{ backgroundColor: preset.accent }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900 truncate">
                      {preset.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Pickers */}
        <div className="form-row mt-4">
          <label>
            Primary Brand Color
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 p-0.5 rounded-lg border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="font-mono text-xs uppercase"
                maxLength={7}
              />
            </div>
          </label>
          <label>
            Accent Highlight Color
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-10 h-10 p-0.5 rounded-lg border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="font-mono text-xs uppercase"
                maxLength={7}
              />
            </div>
          </label>
        </div>

        {/* Live Preview Box */}
        <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
          <span className="block text-xs font-semibold uppercase text-slate-500 mb-2">
            Live Interface Preview
          </span>
          <div
            className="p-4 rounded-xl text-white flex items-center justify-between shadow-md"
            style={{ backgroundColor: primaryColor }}
          >
            <div>
              <strong className="block text-sm font-bold">Your PG Workspace</strong>
              <small className="text-xs opacity-80">Primary theme container</small>
            </div>
            <span
              className="px-3 py-1 text-xs font-bold rounded-lg"
              style={{ backgroundColor: accentColor, color: primaryColor }}
            >
              Live Action Badge
            </span>
          </div>
        </div>

        {saved && (
          <div className="live-operator-feedback feedback-success" role="status">
            <CheckCircle2 size={17} />
            Color scheme saved and applied instantly!
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="button button-secondary flex items-center gap-2"
          >
            <RefreshCw size={15} />
            <span>Reset Default</span>
          </button>
          <button
            type="submit"
            className="button button-primary button-full flex items-center justify-center gap-2"
            disabled={submitting}
          >
            <Sparkles size={16} />
            <span>{submitting ? "Applying Theme…" : "Save Color Scheme"}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
