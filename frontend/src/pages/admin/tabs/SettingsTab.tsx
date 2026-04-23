import { useState, useEffect } from "react";
import { api } from "../../../api/client";
import type { AppSettings } from "../../../types";
import { Loader2, Info, Eye, EyeOff } from "lucide-react";

export default function SettingsTab() {
  const [settings, setSettings] = useState<AppSettings>({
    resend_api_key: null,
    resend_from_email: "noreply@example.com",
    resend_from_name: "ALJ Examination System",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    api.settings
      .get()
      .then((s) => setSettings(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof AppSettings, v: string | null) =>
    setSettings((prev) => ({ ...prev, [k]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.settings.update({
        resend_api_key: settings.resend_api_key || null,
        resend_from_email: settings.resend_from_email,
        resend_from_name: settings.resend_from_name,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-400 py-12">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading settings…</span>
      </div>
    );
  }

  const resendConfigured = Boolean(settings.resend_api_key);

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900 mb-1">
        Settings
      </h1>
      <p className="text-stone-500 text-sm mb-8">Global application settings</p>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Email Provider */}
        <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
          <h2 className="text-base font-semibold text-stone-900 mb-1">Email Provider</h2>
          <p className="text-stone-500 text-xs mb-4">
            Used to send result notifications to students. If a Resend API key is configured it
            takes priority; otherwise the server falls back to SMTP environment variables.
          </p>

          {resendConfigured && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
              Resend is active — emails will be sent via the Resend API.
            </div>
          )}

          {!resendConfigured && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              No Resend key set — falling back to SMTP environment variables.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1.5 block">
                Resend API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={settings.resend_api_key ?? ""}
                  onChange={(e) => set("resend_api_key", e.target.value || null)}
                  placeholder="re_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full border border-stone-300 shadow-sm px-3 py-2 pr-10 text-sm font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-stone-400 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3 flex-shrink-0" />
                Leave blank to disable Resend and use SMTP fallback.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1.5 block">
                  From Email
                </label>
                <input
                  type="email"
                  value={settings.resend_from_email}
                  onChange={(e) => set("resend_from_email", e.target.value)}
                  placeholder="noreply@yourdomain.com"
                  className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
                />
                <p className="text-xs text-stone-400 mt-1">
                  Must be verified in your Resend account.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1.5 block">
                  From Name
                </label>
                <input
                  type="text"
                  value={settings.resend_from_name}
                  onChange={(e) => set("resend_from_name", e.target.value)}
                  placeholder="ALJ Examination System"
                  className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 bg-stone-50 border border-stone-100 p-4 rounded-lg">
            <p className="text-stone-700 text-xs font-semibold mb-2 uppercase tracking-widest">
              How email notifications work
            </p>
            <ul className="text-stone-500 text-sm space-y-1">
              <li>• Enable <strong>Send email notification to students</strong> in the exam Config tab.</li>
              <li>• Set the <strong>Auto-Publish Results At</strong> time — emails are sent automatically when results go live.</li>
              <li>• Students must have an email address imported with their data.</li>
            </ul>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900 rounded-lg">
            {error}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-brand-700 text-white font-bold text-[10px] uppercase tracking-widest px-8 h-11 shadow-md shadow-brand-900/10 hover:bg-brand-800 transition-all disabled:opacity-60 flex items-center justify-center gap-2 rounded-lg"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              "✓ Settings Saved"
            ) : (
              "Save Settings"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
