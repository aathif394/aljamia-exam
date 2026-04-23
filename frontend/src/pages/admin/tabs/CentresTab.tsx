import { useState } from "react";
import { api } from "../../../api/client";
import type { Centre } from "../../../types";
import { Plus, Loader2, Building2, Trash2, Edit3, ShieldAlert } from "lucide-react";

export default function CentresTab({
  centres,
  onRefresh,
}: {
  centres: Centre[];
  onRefresh: () => void;
}) {
  const [form, setForm] = useState({ name_en: "", name_ar: "", wifi_ssid: "", allowed_ip_ranges: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name_en.trim()) {
      setError("Centre name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await api.admin.updateCentre(editingId, form);
      } else {
        await api.admin.createCentre(form);
      }
      setForm({ name_en: "", name_ar: "", wifi_ssid: "", allowed_ip_ranges: [] });
      setEditingId(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete centre?")) return;
    try {
      await api.admin.deleteCentre(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Delete failed");
    }
  };

  const startEdit = (c: Centre) => {
    setEditingId(c.id);
    setForm({
      name_en: c.name_en,
      name_ar: c.name_ar || "",
      wifi_ssid: c.wifi_ssid || "",
      allowed_ip_ranges: c.allowed_ip_ranges || []
    });
    // Scroll to form
    const f = document.getElementById("centre-form");
    f?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 mb-1">
          Examination Centres
        </h1>
        <p className="text-stone-500 text-sm">
          Manage the physical exam centres, network configurations, and IP restrictions.
        </p>
      </div>

      {/* Existing centres */}
      <div className="bg-white border border-stone-200 shadow-sm mb-8 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-widest flex items-center gap-2">
            <Building2 className="w-4 h-4 text-stone-500" />
            Active Centres ({centres.length})
          </h2>
        </div>

        {centres.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-stone-500 text-sm">
              No centres have been configured yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Centre Name
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    WiFi / IP Ready
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {centres.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors"
                  >
                    <td className="px-4 py-4 text-sm font-mono text-stone-400">
                      {c.id}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold text-stone-900">{c.name_en}</p>
                      <p className="text-xs text-brand-700 font-arabic mt-0.5" dir="rtl">{c.name_ar}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${c.wifi_ssid ? "bg-teal-500" : "bg-stone-200"}`} />
                        <span className="text-xs text-stone-500 font-mono">{c.wifi_ssid || "No WiFi"}</span>
                        {c.allowed_ip_ranges && c.allowed_ip_ranges.length > 0 && (
                           <span className="bg-brand-50 text-brand-700 text-[10px] px-2 py-0.5 font-bold uppercase tracking-widest border border-brand-100">
                             {c.allowed_ip_ranges.length} IP Rules
                           </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => startEdit(c)}
                          className="p-2 text-stone-400 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-all"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(c.id)}
                          className="p-2 text-stone-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit form */}
      <div id="centre-form" className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
        <h2 className="text-lg font-bold text-stone-900 mb-5 uppercase tracking-widest flex items-center gap-2">
          {editingId ? "Edit Centre" : "Add New Centre"}
          {editingId && (
            <button 
              onClick={() => { setEditingId(null); setForm({ name_en: "", name_ar: "", wifi_ssid: "", allowed_ip_ranges: [] }); }}
              className="ml-auto text-[10px] text-stone-400 hover:text-stone-600 flex items-center gap-1"
            >
              Cancel Edit
            </button>
          )}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2 block">
                Name (English) <span className="text-brand-700">*</span>
              </label>
              <input
                value={form.name_en}
                onChange={(e) => set("name_en", e.target.value)}
                placeholder="e.g. Kozhikode Main Centre"
                className="w-full border border-stone-300 shadow-sm px-4 py-2.5 text-sm text-stone-900 bg-white placeholder-stone-400 focus:ring-2 focus:ring-brand-500 rounded-lg outline-none transition-shadow"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2 block">
                Name (Arabic)
              </label>
              <input
                value={form.name_ar}
                onChange={(e) => set("name_ar", e.target.value)}
                dir="rtl"
                placeholder="اسم المركز"
                className="w-full border border-stone-300 shadow-sm px-4 py-2.5 text-sm text-stone-900 bg-white placeholder-stone-400 focus:ring-2 focus:ring-brand-500 rounded-lg outline-none transition-shadow font-arabic"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2 block">
                WiFi SSID
              </label>
              <input
                value={form.wifi_ssid}
                onChange={(e) => set("wifi_ssid", e.target.value)}
                placeholder="ExamWiFi_01"
                className="w-full border border-stone-300 shadow-sm px-4 py-2.5 text-sm text-stone-900 bg-white placeholder-stone-400 font-mono focus:ring-2 focus:ring-brand-500 rounded-lg outline-none transition-shadow"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2 block">
                IP Ranges (JSON Array)
              </label>
              <input
                value={JSON.stringify(form.allowed_ip_ranges)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    if (Array.isArray(parsed)) set("allowed_ip_ranges", parsed);
                  } catch {}
                }}
                placeholder='["192.168.1.0/24"]'
                className="w-full border border-stone-300 shadow-sm px-4 py-2.5 text-xs text-stone-600 bg-stone-50 font-mono focus:ring-2 focus:ring-brand-500 rounded-lg outline-none transition-shadow"
              />
              <p className="text-[10px] text-stone-400 mt-1">Example: ["10.0.0.0/8"]</p>
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900 flex items-center gap-2 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-brand-700 text-white font-bold text-[10px] uppercase tracking-[0.2em] px-8 h-12 shadow-md hover:bg-brand-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2 rounded-lg"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                "✓ Success"
              ) : editingId ? (
                "Update Centre"
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Create Centre
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
