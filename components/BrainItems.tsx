"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const area: React.CSSProperties = { font: "inherit", color: "inherit", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", width: "100%", minHeight: 90 };

export default function BrainItems({ siteId, kinds }: { siteId: string | null; kinds: string[] }) {
  const [items, setItems] = useState<any[]>([]);
  const [kind, setKind] = useState(kinds[0]); const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [url, setUrl] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    let q = supabase.from("brain_items").select("id,kind,title,body,source_url,file_path,created_at").eq("status", "active").order("created_at", { ascending: false }).limit(300);
    q = siteId ? q.eq("site_id", siteId) : q.is("site_id", null);
    const { data } = await q; setItems(data || []);
  }, [siteId]);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!title.trim()) return; setBusy(true);
    let file_path: string | null = null;
    if (file) {
      const p = `${siteId || "global"}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const up = await supabase.storage.from("brain").upload(p, file);
      if (up.error) { alert(up.error.message); setBusy(false); return; }
      file_path = p;
    }
    const { error } = await supabase.from("brain_items").insert({ site_id: siteId, kind, title: title.trim(), body, source_url: url || null, file_path });
    setBusy(false); if (error) { alert(error.message); return; }
    setTitle(""); setBody(""); setUrl(""); setFile(null); load();
  }
  async function remove(id: number) {
    if (!confirm("Remove this item from the brain?")) return;
    await supabase.from("brain_items").update({ status: "archived" }).eq("id", id); load();
  }
  async function openFile(path: string) {
    const { data } = await supabase.storage.from("brain").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }
  const shown = items.filter(i => filter === "all" || i.kind === filter);

  return (<>
    <form className="card" onSubmit={add} style={{ marginBottom: 14 }}>
      <h2>Add to the brain</h2>
      <div className="grid g2">
        <div className="grid">
          <select value={kind} onChange={e => setKind(e.target.value)}>{kinds.map(k => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select>
          <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} required />
          <input placeholder="Source link (optional)" value={url} onChange={e => setUrl(e.target.value)} />
          <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
        </div>
        <textarea style={area} placeholder="Text / notes / facts (the agent reads this)" value={body} onChange={e => setBody(e.target.value)} />
      </div>
      <div className="row" style={{ marginTop: 10, marginBottom: 0 }}><button className="pri" disabled={busy}>{busy ? "Saving…" : "Add"}</button></div>
    </form>
    <div className="row tabs"><button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>all ({items.length})</button>
      {kinds.map(k => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k.replace("_", " ")}</button>)}</div>
    <div className="card tw"><table><thead><tr><th>Type</th><th>Title</th><th>Details</th><th></th></tr></thead><tbody>
      {shown.map(i => (<tr key={i.id}><td><span className="badge">{i.kind.replace("_", " ")}</span></td>
        <td className="small" style={{ minWidth: 160 }}><b>{i.title}</b><div className="muted">{new Date(i.created_at).toLocaleDateString()}</div></td>
        <td className="small" style={{ minWidth: 260 }}>{(i.body || "").slice(0, 280)}{(i.body || "").length > 280 ? "…" : ""}
          <div>{i.source_url && <a href={i.source_url} target="_blank" rel="noreferrer">link</a>}{i.source_url && i.file_path && " · "}{i.file_path && <a href="#" onClick={e => { e.preventDefault(); openFile(i.file_path); }}>file</a>}</div></td>
        <td><button onClick={() => remove(i.id)}>Remove</button></td></tr>))}
      {!shown.length && <tr><td colSpan={4} className="muted">Nothing here yet.</td></tr>}</tbody></table></div>
  </>);
}
