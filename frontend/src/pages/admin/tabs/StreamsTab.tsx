import { useState, useEffect } from "react";
import { api } from "../../../api/client";
import type { StreamDef } from "../../../types";
import { Plus, Loader2, Pencil, Trash2, Check, X } from "lucide-react";

export default function StreamsTab() {
  const [streams, setStreams] = useState<StreamDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const load = async () => {
    try {
      const data = await api.admin.getStreams();
      console.log(data);  
      setStreams(data);
    } catch {
      setError("Failed to load streams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim().toLowerCase();
    if (!name) return;
    setSaving(true);
    setError("");
    try {
      await api.admin.createStream(name);
      setNewName("");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to create stream");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: number) => {
    const name = editName.trim().toLowerCase();
    if (!name) return;
    setError("");
    try {
      await api.admin.updateStream(id, name);
      setEditId(null);
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to update stream");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete stream "${name}"? Students assigned to this stream will be affected.`)) return;
    setError("");
    try {
      await api.admin.deleteStream(id);
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to delete stream");
    }
  };

  const inputBase = "border border-stone-300 px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-stone-900">Streams</h2>
        <p className="text-sm text-stone-500 mt-1">
          Manage exam streams/tracks. Sections 1–4 apply to all streams. Section 5 is stream-specific.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-3 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New stream name (e.g. science)"
          className={`${inputBase} flex-1`}
        />
        <button
          type="submit"
          disabled={saving || !newName.trim()}
          className="flex items-center gap-2 bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-800 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Stream
        </button>
      </form>

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
          </div>
        ) : streams.length === 0 ? (
          <div className="text-center py-12 text-stone-400 text-sm">No streams defined</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="px-5 py-3 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Name</th>
                <th className="px-5 py-3 text-right text-[10px] font-bold text-stone-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s) => (
                <tr key={s.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50">
                  <td className="px-5 py-3.5">
                    {editId === s.id ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={`${inputBase} w-48`}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdate(s.id);
                          if (e.key === "Escape") setEditId(null);
                        }}
                      />
                    ) : (
                      <span className="font-medium text-stone-700 capitalize">{s.name}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editId === s.id ? (
                        <>
                          <button
                            onClick={() => handleUpdate(s.id)}
                            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded transition-colors"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="p-1.5 text-stone-400 hover:bg-stone-100 rounded transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditId(s.id); setEditName(s.name); }}
                            className="p-1.5 text-stone-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id, s.name)}
                            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
