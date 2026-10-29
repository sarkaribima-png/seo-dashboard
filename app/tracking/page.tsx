"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const DEV = ["desktop", "mobile"] as const;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
async function fetchAll(build: (from: number, to: number) => any) {
  let out: any[] = []; for (let i = 0; i < 20; i++) { const { data } = await build(i * 1000, i * 1000 + 999); out = out.concat(data || []); if (!data || data.length < 1000) break; } return out;
}

export default function Tracking() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [kws, setKws] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]); const [changes, setChanges] = useState<any[]>([]); const [applied, setApplied] = useState<any[]>([]);
  const [kw, setKw] = useState(""); const [page, setPage] = useState(""); const [prio, setPrio] = useState("urgent"); const [msg, setMsg] = useState(""); const [sel, setSel] = useState<any>(null);

  useEffect(() => { supabase.from("sites").select("*").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const [k, r, c, a] = await Promise.all([
      supabase.from("tracked_keywords").select("*").eq("site_id", site).order("priority").order("keyword"),
      fetchAll((f, t) => supabase.from("rank_daily").select("*").eq("site_id", site).gte("day", since).order("day").range(f, t)),
      supabase.from("page_changes").select("*").eq("site_id", site).gte("modified_at", since),
      supabase.from("proposals").select("page,kind,applied_at").eq("site_id", site).eq("status", "applied").gte("applied_at", since)]);
    setKws(k.data || []); setRows(r); setChanges(c.data || []); setApplied(a.data || []);
  }, [site]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const m: Record<string, any> = {};
    for (const k of kws) {
      const o: any = {};
      for (const d of DEV) {
        const rs = rows.filter(x => x.keyword === k.keyword && x.device === d && x.position != null).sort((a, b) => a.day.localeCompare(b.day));
        const last = rs.slice(-3), prev = rs.slice(-10, -3);
        const now = avg(last.map(x => +x.position)), before = avg(prev.map(x => +x.position));
        o[d] = { now, before, delta: now != null && before != null ? now - before : null, day: rs.at(-1)?.day, imp: last.reduce((s, x) => s + (x.impressions || 0), 0),
          alert: now != null && before != null && (now - before >= 3 || (before <= 20 && now > 20)) };
      }
      m[k.id] = o;
    }
    return m;
  }, [kws, rows]);

  async function add() {
    const own = page.trim();
    if (!kw.trim() || !/^https?:\/\//.test(own)) return setMsg("Enter the keyword and the full page URL (https://…).");
    const { error } = await supabase.from("tracked_keywords").insert({ site_id: site, keyword: kw.trim().toLowerCase(), page_url: own, priority: prio });
    if (error) return setMsg(error.message.includes("duplicate") ? "Already tracked." : error.message);
    setKw(""); setPage(""); setMsg("Added. Press “Update rankings now” to pull its history."); load();
  }
  async function toggle(k: any) { await supabase.from("tracked_keywords").update({ active: !k.active }).eq("id", k.id); load(); }
  async function remove(k: any) { if (confirm("Stop tracking “" + k.keyword + "”?")) { await supabase.from("tracked_keywords").delete().eq("id", k.id); if (sel?.id === k.id) setSel(null); load(); } }
  async function run() {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/content-run", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ site, command: "track" }) });
    const j = await r.json().catch(() => ({})); setMsg(j.message || j.error || "");
  }

  const f = (n: number | null) => (n == null ? "–" : n.toFixed(1));
  const arrow = (d: number | null) => (d == null ? "" : d <= -0.5 ? <span style={{ color: "#3fb950" }}> ▲ {Math.abs(d).toFixed(1)}</span> : d >= 0.5 ? <span style={{ color: "#f85149" }}> ▼ {d.toFixed(1)}</span> : <span className="muted"> =</span>);
  const alerts = kws.filter(k => k.active && DEV.some(d => stats[k.id]?.[d]?.alert));

  const chart = useMemo(() => {
    if (!sel) return [];
    const days: Record<string, any> = {};
    for (const r of rows) if (r.keyword === sel.keyword) (days[r.day] ||= { day: r.day })[r.device] = +r.position;
    return Object.values(days).sort((a: any, b: any) => a.day.localeCompare(b.day));
  }, [sel, rows]);
  const marks = useMemo(() => {
    if (!sel) return [];
    const ms: { day: string; label: string }[] = [];
    changes.filter(c => c.page_url === sel.page_url).forEach(c => ms.push({ day: c.modified_at.slice(0, 10), label: "page edited" }));
    applied.filter(a => a.page === sel.page_url && a.applied_at).forEach(a => ms.push({ day: a.applied_at.slice(0, 10), label: "agent: " + a.kind }));
    return ms.filter(m => chart.some((c: any) => c.day === m.day));
  }, [sel, changes, applied, chart]);

  function report() {
    const lines = ["Ranking report · " + (sites.find(s => s.id === site)?.domain || site) + " · " + new Date().toISOString().slice(0, 10), "(average Google position, lower is better; last 3 days vs the 7 days before)", ""];
    kws.filter(k => k.active).forEach(k => { const s = stats[k.id] || {};
      lines.push(`${k.keyword}${k.priority === "urgent" ? " [urgent]" : ""}: desktop ${f(s.desktop?.now)} (was ${f(s.desktop?.before)}), mobile ${f(s.mobile?.now)} (was ${f(s.mobile?.before)})`); });
    navigator.clipboard?.writeText(lines.join("\n")); setMsg("Report copied. Paste it into WhatsApp or email.");
  }

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Rank tracking</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /><button onClick={run}>Update rankings now</button><button onClick={report}>Copy report</button></div>
    <p className="muted small">Average Google position for each keyword, desktop and mobile separately (from Search Console, about 2 days behind). Lower is better. Lines on the chart show when the page was edited.</p>
    {msg && <p className="small">{msg}</p>}
    {alerts.length > 0 && <div className="card" style={{ borderColor: "#f85149" }}><b>Needs attention</b>{alerts.map(k => <div key={k.id} className="small">• <b>{k.keyword}</b> dropped. Check what changed on the page before it fell, and roll it back if an agent change matches the date.</div>)}</div>}
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <input placeholder="Keyword, e.g. liposuction in gurgaon" value={kw} onChange={e => setKw(e.target.value)} />
      <input placeholder="Page that should rank (https://www.kalosa.in/…)" value={page} onChange={e => setPage(e.target.value)} />
      <div className="row"><select value={prio} onChange={e => setPrio(e.target.value)}><option value="urgent">Urgent</option><option value="normal">Normal</option></select><button className="ok" onClick={add}>Track this keyword</button></div>
    </div>
    <div className="card tw"><table><thead><tr><th>Keyword / page</th><th>Desktop</th><th>Mobile</th><th></th></tr></thead><tbody>
      {kws.map(k => { const s = stats[k.id] || {}; return (<tr key={k.id} style={{ opacity: k.active ? 1 : .5, cursor: "pointer" }} onClick={() => setSel(k)}>
        <td className="small" style={{ minWidth: 220 }}><b>{k.keyword}</b> {k.priority === "urgent" && <span className="badge b-failed">urgent</span>}<div className="muted">{(k.page_url || "").replace(/^https?:\/\/[^/]+/, "")}</div></td>
        {DEV.map(d => <td key={d} className="small"><b>{f(s[d]?.now)}</b>{arrow(s[d]?.delta)}<div className="muted">{s[d]?.day ? "to " + s[d].day : "no data yet"}</div></td>)}
        <td style={{ whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}><button onClick={() => toggle(k)}>{k.active ? "Pause" : "Resume"}</button> <button className="bad" onClick={() => remove(k)}>Remove</button></td></tr>); })}
      {!kws.length && <tr><td colSpan={4} className="muted">No keywords yet. Add the ones the client wants on top.</td></tr>}</tbody></table></div>
    {sel && <div className="card"><div className="row"><b>{sel.keyword}</b><span className="sp" /><button onClick={() => setSel(null)}>Close</button></div>
      {chart.length ? <div style={{ width: "100%", height: 320 }}><ResponsiveContainer><LineChart data={chart as any[]} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis reversed domain={[1, "dataMax + 3"]} tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Legend />
        <Line type="monotone" dataKey="desktop" stroke="#58a6ff" dot={false} connectNulls /><Line type="monotone" dataKey="mobile" stroke="#f0883e" dot={false} connectNulls />
        {marks.map((m, i) => <ReferenceLine key={i} x={m.day} stroke="#a371f7" strokeDasharray="4 4" label={{ value: m.label, fontSize: 10, fill: "#a371f7", position: "insideTop" }} />)}
      </LineChart></ResponsiveContainer></div> : <p className="muted small">No data yet for this keyword. Press “Update rankings now”. If it stays empty, Google has no impressions for this exact query yet.</p>}
    </div>}
  </Shell>);
}
