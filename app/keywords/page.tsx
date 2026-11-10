"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

const SRC: Record<string, string> = { striking_distance: "Striking distance", cannibalization: "Cannibalization", tracked_page_mismatch: "Wrong page ranks", competitor_gap: "Content gap" };
const fmt = (n: any, d = 0) => (n == null ? "–" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));

export default function Keywords() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [rows, setRows] = useState<any[]>([]);
  const [src, setSrc] = useState("all"); const [status, setStatus] = useState("new"); const [dev, setDev] = useState("all"); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => { supabase.from("sites").select("*").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    const { data, error } = await supabase.from("keyword_opps").select("*").eq("site_id", site).order("score", { ascending: false }).limit(500);
    if (error) setMsg(error.message.includes("keyword_opps") ? "Table keyword_opps is missing: run schema_v18.sql in Supabase once." : error.message);
    setRows(data || []);
  }, [site]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => rows.filter(r => (src === "all" || r.source === src) && (status === "all" || r.status === status) && r.device === dev), [rows, src, status, dev]);
  const order: Record<string, number> = { High: 0, Med: 1, Low: 2 };
  const sorted = useMemo(() => [...shown].sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3) || (b.score || 0) - (a.score || 0)), [shown]);

  async function decide(id: number, s: "approved" | "rejected" | "new") { await supabase.from("keyword_opps").update({ status: s }).eq("id", id); load(); }
  async function runNow() {
    setBusy(true); const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/content-run", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ site, command: "keywords" }) });
    const j = await r.json().catch(() => ({})); setMsg(j.message || j.error || ""); setBusy(false);
  }
  const count = (s: string) => rows.filter(r => r.source === s && r.device === "all").length;

  return (<Shell><div className="row"><h2>Keyword opportunities</h2><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <p className="muted small">From Search Console (last 28 days) and imported competitor data. Position, impressions, clicks and CTR are measured. Difficulty is a relative <b>estimate</b> unless it says “ahrefs”. Nothing here changes your site: approve a row and the agent only adds new-page topics to Content ideas.</p>
    <div className="card"><div className="row">
      <select value={src} onChange={e => setSrc(e.target.value)}><option value="all">All types</option>{Object.entries(SRC).map(([k, v]) => <option key={k} value={k}>{v} ({count(k)})</option>)}</select>
      <select value={status} onChange={e => setStatus(e.target.value)}>{["new", "approved", "fed", "rejected", "all"].map(s => <option key={s} value={s}>{s === "fed" ? "sent to Content ideas" : s}</option>)}</select>
      <select value={dev} onChange={e => setDev(e.target.value)}><option value="all">All devices</option><option value="desktop">Desktop only (striking)</option><option value="mobile">Mobile only (striking)</option></select>
      <span className="sp" /><button disabled={busy} onClick={runNow}>{busy ? "Starting…" : "Refresh now"}</button></div>
      {msg && <p className="small">{msg}</p>}</div>
    <div className="card" style={{ overflowX: "auto" }}><table><thead><tr><th>Keyword</th><th>Cluster</th><th>Intent</th><th>Position</th><th>Impressions</th><th>Clicks / CTR</th><th>Difficulty</th><th>Page (existing / new)</th><th>Priority</th><th>Type</th><th></th></tr></thead>
      <tbody>{sorted.map(r => (<tr key={r.id} title={r.notes || ""}>
        <td><b>{r.keyword}</b></td><td className="small">{r.cluster || "–"}</td><td>{r.intent || "–"}</td>
        <td>{fmt(r.position, 1)}</td><td>{fmt(r.impressions)}</td><td>{r.impressions != null ? `${fmt(r.clicks)} / ${(Number(r.ctr || 0) * 100).toFixed(1)}%` : "–"}</td>
        <td>{r.difficulty_estimate || "–"} <span className="muted small">{r.difficulty_source === "estimate" ? "(estimate)" : r.kd != null ? `(KD ${fmt(r.kd)}, vol ${fmt(r.volume)})` : ""}</span></td>
        <td className="small">{r.page_exists ? "Existing: " : "New: "}<a href={r.recommended_page?.startsWith("http") ? r.recommended_page : undefined} target="_blank" rel="noreferrer">{r.recommended_page || "–"}</a></td>
        <td><b>{r.priority}</b></td><td className="small">{SRC[r.source] || r.source}</td>
        <td style={{ whiteSpace: "nowrap" }}>{r.status === "new" ? (<><button onClick={() => decide(r.id, "approved")}>Approve</button> <button onClick={() => decide(r.id, "rejected")}>Skip</button></>) : <span className="muted small">{r.status}</span>}
          {(r.status === "approved" || r.status === "rejected") && <button onClick={() => decide(r.id, "new")}>Undo</button>}</td></tr>))}
        {!sorted.length && <tr><td colSpan={11} className="muted">Nothing here yet. Run schema_v18.sql once, then Actions → keywords (or Refresh now).</td></tr>}</tbody></table>
      <p className="muted small">Hover a row for the reason. Wrong-page and cannibalization rows are advice only: merging, redirects or noindex always need your approval and are never automatic. Medical topics need doctor review before publishing.</p></div></Shell>);
}
