"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

const COL: Record<string, string> = { improved: "var(--ok)", worse: "var(--bad)", flat: "var(--warn)", too_early: "var(--mut)", "DATA NOT AVAILABLE": "var(--mut)" };
const LABEL: Record<string, string> = { improved: "Improved", worse: "Worse", flat: "Flat", too_early: "Too early", "DATA NOT AVAILABLE": "Data not available" };
const Badge = ({ v }: { v: string }) => <span className="badge" style={{ color: COL[v] || "var(--mut)" }}>{LABEL[v] || v}</span>;
const path = (u: string) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";
const days = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
const lines = (s: string) => s.split("\n").map(x => x.trim()).filter(Boolean);
const f = (x: any, d = 0) => (x === null || x === undefined ? "n/a" : Number(x).toFixed(d));
const EMPTY = { goal_text: "", kw: "", pages: "", cap: 8, level: 2, active: true };

export default function Strategy() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [g, setG] = useState<any>(EMPTY); const [exists, setExists] = useState(false);
  const [rows, setRows] = useState<any[]>([]); const [msg, setMsg] = useState(""); const [flt, setFlt] = useState("all");

  const load = useCallback(async (s: string) => {
    setMsg("");
    const a = await supabase.from("site_goals").select("*").eq("site_id", s).maybeSingle();
    if (a.error) setMsg("Could not load goals: " + a.error.message + " (has schema_v24.sql been run?)");
    setExists(!!a.data);
    setG(a.data ? { goal_text: a.data.goal_text || "", kw: (a.data.target_keywords || []).join("\n"), pages: (a.data.money_pages || []).join("\n"), cap: a.data.monthly_post_cap ?? 8, level: a.data.autonomy_level ?? 2, active: a.data.active !== false } : EMPTY);
    const b = await supabase.from("change_log_followups").select("*").eq("site_id", s).order("applied_at", { ascending: false }).limit(300);
    if (b.error && !a.error) setMsg("Could not load follow-ups: " + b.error.message);
    setRows(b.data || []);
  }, []);
  useEffect(() => { supabase.from("sites").select("id,domain").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  useEffect(() => { if (site) load(site); }, [site, load]);

  async function save() {
    const row = { site_id: site, goal_text: g.goal_text.trim(), target_keywords: lines(g.kw), money_pages: lines(g.pages), monthly_post_cap: Math.max(0, Math.floor(+g.cap || 0)), autonomy_level: +g.level, active: g.active, updated_at: new Date().toISOString() };
    const { error } = exists ? await supabase.from("site_goals").update(row).eq("site_id", site) : await supabase.from("site_goals").insert(row);
    setMsg(error ? "Could not save: " + error.message : "Goals saved."); if (!error) load(site);
  }

  const list = rows.filter(r => flt === "all" || r.verdict === flt);
  const count = (v: string) => rows.filter(r => r.verdict === v).length;
  const wins = rows.filter(r => r.verdict === "improved");

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Strategy</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <p className="muted small">Goals decide what the weekly plan pushes first. Every applied change is re-checked on day 3, 14 and 28. Results say "ho sakta hai": a change is never proven to be the cause. The Strategist never changes a live site; anything it suggests is a pending proposal.</p>
    {msg && <p className="small">{msg}</p>}

    <div className="card" style={{ display: "grid", gap: 8, marginBottom: 14 }}>
      <b>Goals for this site</b>
      <input placeholder="Goal, e.g. more consultation enquiries for tummy tuck in Delhi" value={g.goal_text} onChange={e => setG({ ...g, goal_text: e.target.value })} />
      <div className="row" style={{ marginBottom: 0, alignItems: "flex-start" }}>
        <label className="small" style={{ flex: 1, minWidth: 220 }}>Target keywords (one per line)<textarea rows={4} style={{ width: "100%" }} value={g.kw} onChange={e => setG({ ...g, kw: e.target.value })} /></label>
        <label className="small" style={{ flex: 1, minWidth: 220 }}>Money pages (full URL, one per line)<textarea rows={4} style={{ width: "100%" }} value={g.pages} onChange={e => setG({ ...g, pages: e.target.value })} /></label>
      </div>
      <div className="row" style={{ marginBottom: 0 }}>
        <label className="small">Posts per month (cap) <input type="number" min={0} style={{ width: 70 }} value={g.cap} onChange={e => setG({ ...g, cap: e.target.value })} /></label>
        <label className="small">Autonomy <select value={g.level} onChange={e => setG({ ...g, level: +e.target.value })}>
          <option value={1}>1 - only watch and report</option><option value={2}>2 - also create pending follow-up proposals</option><option value={3}>3 - same as 2 for now (reserved)</option></select></label>
        <label className="small"><input type="checkbox" checked={g.active} onChange={e => setG({ ...g, active: e.target.checked })} /> Active</label>
        <span className="sp" /><button onClick={save}>Save goals</button></div>
      <span className="muted small">Every level still needs your approval before anything goes live. Medical sites also need the reviewer.</span>
    </div>

    <div className="grid g4" style={{ marginBottom: 14 }}>
      {["improved", "flat", "worse", "too_early"].map(v => <div key={v} className="card kpi"><div className="l">{LABEL[v]}</div><div className="v" style={{ color: COL[v] }}>{count(v)}</div></div>)}</div>

    {!!wins.length && <div className="card" style={{ marginBottom: 14 }}><b>Winner patterns</b>
      <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{wins.slice(0, 8).map(w => <li key={w.id}>{w.kind} on {path(w.url)}: position {f(w.check_day28?.pos_delta, 1)} better, impressions/day {w.check_day28?.impr_delta_pct == null ? "n/a" : (w.check_day28.impr_delta_pct > 0 ? "+" : "") + w.check_day28.impr_delta_pct + "%"} <span className="muted">(ho sakta hai ye pattern kaam karta hai)</span></li>)}</ul></div>}

    <div className="row tabs">{["all", "improved", "flat", "worse", "too_early", "DATA NOT AVAILABLE"].map(k => <button key={k} className={flt === k ? "on" : ""} onClick={() => setFlt(k)}>{k === "all" ? "All" : LABEL[k]}</button>)}</div>
    <div className="card" style={{ display: "grid", gap: 12 }}>
      {!list.length && <p className="muted">No follow-ups yet. They appear after a change is applied (run the "seo-strategist" workflow once).</p>}
      {list.map(r => { const d = days(r.applied_at); const c3 = r.check_day3, c14 = r.check_day14, c28 = r.check_day28; return (
        <div key={r.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
          <div className="row" style={{ marginBottom: 4 }}><Badge v={r.verdict} /><b>{r.kind}</b><a href={r.url} target="_blank" rel="noreferrer" className="small">{path(r.url)}</a><span className="sp" />
            <span className="muted small">applied {String(r.applied_at).slice(0, 10)} ({d}d ago) · proposal #{r.proposal_id}{r.confidence ? " · confidence " + r.confidence : ""}</span></div>
          <div className="row small" style={{ marginBottom: 4, alignItems: "flex-start" }}>
            <div style={{ minWidth: 150 }}><b>Baseline</b><div>{r.baseline?.impressions == null ? <span className="muted">DATA NOT AVAILABLE</span> : <>impr {f(r.baseline.impressions)}, clicks {f(r.baseline.clicks)}, pos {f(r.baseline.position, 1)}</>}</div></div>
            <div style={{ minWidth: 150 }}><b>Day 3</b><div>{c3 ? <>{c3.status}{c3.source === "gsc_impressions" ? " (impressions se)" : ""}</> : <span className="muted">{d >= 3 ? "pending" : "in " + (3 - d) + "d"}</span>}</div></div>
            <div style={{ minWidth: 150 }}><b>Day 14</b><div>{c14 ? <>impr/day {c14.impr_delta_pct == null ? "n/a" : (c14.impr_delta_pct > 0 ? "+" : "") + c14.impr_delta_pct + "%"} ({f(c14.impressions)} in {c14.days_after}d)</> : <span className="muted">{d >= 14 ? "pending" : "in " + (14 - d) + "d"}</span>}</div></div>
            <div style={{ minWidth: 150 }}><b>Day 28</b><div>{c28 ? <>pos {c28.pos_delta == null ? "n/a" : (c28.pos_delta > 0 ? "+" : "") + c28.pos_delta}, impr/day {c28.impr_delta_pct == null ? "n/a" : (c28.impr_delta_pct > 0 ? "+" : "") + c28.impr_delta_pct + "%"}</> : <span className="muted">{d >= 28 ? "pending" : "in " + (28 - d) + "d"}</span>}</div></div></div>
          {r.next_action && <div className="small"><b>Next:</b> {r.next_action}{r.meta?.text_source === "llm" && <span className="muted"> (Claude)</span>}</div>}
          {c28?.note && <div className="muted small">{c28.note}</div>}
          {r.followup_proposal_id && <div className="small">Follow-up proposal #{r.followup_proposal_id} is waiting in <a href="/proposals">Proposals</a>.</div>}
        </div>); })}
    </div>
  </Shell>);
}
