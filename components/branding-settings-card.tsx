"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Palette, CheckCircle2, Sparkles, RefreshCw } from "lucide-react";
import { DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_PRIMARY, isBrandColor } from "@/lib/branding";

export interface ColorPreset {
  id: string;
  name: string;
  primary: string;
  accent: string;
}

export const PRESET_THEMES: ColorPreset[] = [
  { id: "forest", name: "Forest & Lime (Default)", primary: DEFAULT_BRAND_PRIMARY, accent: DEFAULT_BRAND_ACCENT },
  { id: "indigo", name: "Royal Indigo", primary: "#3730a3", accent: "#c7d2fe" },
  { id: "emerald", name: "Emerald Mint", primary: "#065f46", accent: "#a7f3d0" },
  { id: "ocean", name: "Ocean Blue", primary: "#0f4c81", accent: "#bae6fd" },
  { id: "crimson", name: "Crimson Coral", primary: "#881337", accent: "#fecdd3" },
  { id: "teal", name: "Teal & Amber", primary: "#115e59", accent: "#fef08a" },
];

export type BrandThemeSettings = { primaryColor: string; accentColor: string };

/**
 * The saved theme is applied by the server: `resolveLayoutBrand()` in app/layout.tsx reads
 * brand_themes and writes --brand/--accent onto <html>. This card therefore owns the draft
 * only — component state drives the in-card preview, and a successful save is followed by
 * router.refresh() so the real theme comes back from the server.
 */
export function BrandingSettingsCard({
  initial,
  demoMode,
}: {
  initial: BrandThemeSettings;
  demoMode: boolean;
}) {
  const router = useRouter();
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [accentColor, setAccentColor] = useState(initial.accentColor);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = primaryColor !== initial.primaryColor || accentColor !== initial.accentColor;
  const colorsValid = isBrandColor(primaryColor) && isBrandColor(accentColor);

  function applyPreset(preset: ColorPreset) {
    setPrimaryColor(preset.primary);
    setAccentColor(preset.accent);
    setSaved(false);
    setError(null);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (!colorsValid) {
      setError("Enter both colors as six-digit hex values, for example #123d32.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryColor, accentColor }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; theme?: BrandThemeSettings }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The color scheme could not be saved.");
      }

      if (payload?.theme) {
        setPrimaryColor(payload.theme.primaryColor);
        setAccentColor(payload.theme.accentColor);
      }
      setSaved(true);
      // Pull the persisted theme back through the layout so the whole workspace repaints.
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The color scheme could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel branding-settings-card" aria-labelledby="branding-settings-title">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Workspace appearance</span>
          <h2 id="branding-settings-title">Color scheme &amp; branding</h2>
          <p>Set the primary color and accent highlight used across your PG workspace.</p>
        </div>
        <span className="owner-invite-icon">
          <Palette size={20} />
        </span>
      </div>

      <form className="modal-form" onSubmit={handleSave}>
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Curated color palettes
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PRESET_THEMES.map((preset) => {
              const isSelected = primaryColor === preset.primary && accentColor === preset.accent;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  aria-pressed={isSelected}
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
                    <span className="block text-xs font-bold text-slate-900 truncate">{preset.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-row mt-4">
          <label>
            Primary brand color
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                aria-label="Pick primary brand color"
                value={isBrandColor(primaryColor) ? primaryColor : DEFAULT_BRAND_PRIMARY}
                onChange={(event) => setPrimaryColor(event.target.value)}
                className="w-10 h-10 p-0.5 rounded-lg border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
                className="font-mono text-xs uppercase"
                maxLength={7}
                pattern="#[0-9a-fA-F]{6}"
                aria-label="Primary brand color hex value"
              />
            </div>
          </label>
          <label>
            Accent highlight color
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                aria-label="Pick accent highlight color"
                value={isBrandColor(accentColor) ? accentColor : DEFAULT_BRAND_ACCENT}
                onChange={(event) => setAccentColor(event.target.value)}
                className="w-10 h-10 p-0.5 rounded-lg border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                className="font-mono text-xs uppercase"
                maxLength={7}
                pattern="#[0-9a-fA-F]{6}"
                aria-label="Accent highlight color hex value"
              />
            </div>
          </label>
        </div>

        <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
          <span className="block text-xs font-semibold uppercase text-slate-500 mb-2">Preview</span>
          <div
            className="p-4 rounded-xl text-white flex items-center justify-between shadow-md"
            style={{ backgroundColor: isBrandColor(primaryColor) ? primaryColor : DEFAULT_BRAND_PRIMARY }}
          >
            <div>
              <strong className="block text-sm font-bold">Your PG workspace</strong>
              <small className="text-xs opacity-80">Primary theme container</small>
            </div>
            <span
              className="px-3 py-1 text-xs font-bold rounded-lg"
              style={{
                backgroundColor: isBrandColor(accentColor) ? accentColor : DEFAULT_BRAND_ACCENT,
                color: isBrandColor(primaryColor) ? primaryColor : DEFAULT_BRAND_PRIMARY,
              }}
            >
              Action badge
            </span>
          </div>
        </div>

        {saved && (
          <div className="live-operator-feedback feedback-success" role="status">
            <CheckCircle2 size={17} />
            {demoMode
              ? "Color scheme previewed. The shared demo workspace is not saved."
              : "Color scheme saved for this workspace."}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => applyPreset(PRESET_THEMES[0])}
            className="button button-secondary flex items-center gap-2"
            disabled={submitting}
          >
            <RefreshCw size={15} />
            <span>Reset to default</span>
          </button>
          <button
            type="submit"
            className="button button-primary button-full flex items-center justify-center gap-2"
            disabled={submitting || !colorsValid || !isDirty}
          >
            <Sparkles size={16} />
            <span>{submitting ? "Saving…" : "Save color scheme"}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
