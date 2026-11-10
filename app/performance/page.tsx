"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { supabase, runContent } from "@/lib/supabase";

const NA = "DATA NOT AVAILABLE";
const GC: Record<string, string> = { A: "var(--ok)", B: "var(--ok)", C: "var(--warn)", D: "var(--bad)" };
const LABEL: Record<string, string> = { site_outcomes: "Site SEO outcomes", technical_auditor: "Technical Auditor", keyword_researcher: "Keyword Researcher", content_optimizer: "Content Optimizer", rank_reporter: "Rank Reporter", orchestrator: "Orchestrator", evaluator: "Evaluator", daily_optimizer: "Daily title/meta" };
const num = (x: any, d = 0) => (typeof x === "number" ? x.toLocaleString(undefined, { maximumFractionDigits: d }) : NA);
const pc = (x: any) => (typeof x === "number" ? `${(x * 100).toFixed(0)}%` : NA);
const sg = (x: any, d = 1) => (typeof x === "number" ? `${x > 0 ? "+" : ""}${x.toFixed(d)}` : NA);
const obj = (x: any) => (x && typeof x === "object" ? x : null);
const path = (u: string) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";

function Grade({ g }: { g: string }) {
  const ok = g in GC;
  return <span style={{ fontSize: ok ? 34 : 13, fontWeight: 700, color: ok ? GC[g] : "var(--mut)", lineHeight: 1 }}>{ok ? g : NA}</span>;
}
function KV({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return <div style={{ minWidth: 96 }}><div className="muted small">{k}</div><b>{v}</b>{sub && <div className="muted small">{sub}</div>}</div>;
}
function Trend({ pts }: { pts: [string, number][] }) {
  if (pts.length < 2) return <p className="muted small">Trend needs at least 2 weekly scorecards. The audit table keeps no history, so this line builds up one point per weekly run. {pts.length === 1 && `So far: ${pts[0][1]} open (${pts[0][0]}).`}</p>;
  const W = 520, H = 120, P = 24, mx = Math.max(...pts.map(p => p[1]), 1);
  const xy = pts.map((p, i) => [P + (i * (W - 2 * P)) / (pts.length - 1), H - P - (p[1] / mx) * (H - 2 * P)]);
  return (<svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 560 }} role="img" aria-label="Open technical issues per week">
    <polyline fill="none" stroke="var(--acc)" strokeWidth="2" points={xy.map(p => p.join(",")).join(" ")} />
    {xy.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="3" fill="var(--acc)" /><text x={p[0]} y={p[1] - 7} fontSize="10" textAnchor="middle" fill="currentColor">{pts[i][1]}</text><text x={p[0]} y={H - 6} fontSize="9" textAnchor="middle" fill="var(--mut)">{pts[i][0].slice(5)}</text></g>)}
  </svg>);
}
function Changes({ rows, empty }: { rows: any[]; empty: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (<div className="tw"><table><thead><tr><th>Page</th><th>Change</th><th>Clicks/day</th><th>Impr/day</th><th>Position</th><th>Confidence</th></tr></thead><tbody>
    {rows.map(r => <tr key={r.id}><td className="small">{path(r.page)}</td><td className="small">{r.kind} #{r.id}<div className="muted">{(r.applied_at || "").slice(0, 10)}</div></td>
      <td className="small">{num(r.clicks_pd_before, 1)} to {num(r.clicks_pd_after, 1)} <b className={r.delta_clicks_pd >= 0 ? "up" : "down"}>({sg(r.delta_clicks_pd)})</b></td>
      <td className="small">{sg(r.delta_impr_pd)}</td><td className="small">{r.position_gain == null ? NA : sg(r.position_gain) + " (+ = better)"}</td><td className="small">{r.confidence}</td></tr>)}</tbody></table></div>);
}

export default function Performance() {
  const [sites, setSites] = useState<any[]>([]); const [scope, setScope] = useState(""); const [rows, setRows] = useState<any[]>([]); const [week, setWeek] = useState("");
  const [usage, setUsage] = useState<any[] | null>(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from("sites").select("id,domain").order("id").then(({ data }) => { setSites(data || []); setScope(data?.length ? data[0].id : "ALL"); }); }, []);
  const load = (s: string) => {
    setMsg(""); setWeek("");
    supabase.from("agent_scorecards").select("*").eq("scope", s).order("week", { ascending: false }).limit(600).then(({ data, error }) => {
      if (error) setMsg("Could not load: " + error.message + " (has schema_v26.sql been run? then run the 'evaluator' workflow once)");
      setRows(data || []); if (data?.length) setWeek(data[0].week);
    });
    const m = new Date(); m.setUTCDate(1); m.setUTCHours(0, 0, 0, 0);
    let q = supabase.from("llm_usage").select("agent,cost_usd,site_id").gte("created_at", m.toISOString()).limit(20000);
    if (s !== "ALL") q = q.eq("site_id", s);
    q.then(({ data, error }) => setUsage(error ? null : data || []));
  };
  useEffect(() => { if (scope) load(scope); }, [scope]);

  const weeks = useMemo(() => Array.from(new Set(rows.map(r => r.week))).sort().reverse(), [rows]);
  const cur = rows.filter(r => r.week === week);
  const site = cur.find(r => r.agent === "site_outcomes");
  const agents = cur.filter(r => r.agent !== "site_outcomes").sort((a, b) => (a.grade === NA ? 1 : 0) - (b.grade === NA ? 1 : 0) || a.grade.localeCompare(b.grade) || a.agent.localeCompare(b.agent));
  const sm = site?.metrics || {};
  const trend: [string, number][] = rows.filter(r => r.agent === "site_outcomes" && obj(r.metrics?.tech)).map(r => [r.week, r.metrics.tech.open] as [string, number]).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  const cost = useMemo(() => { const m = new Map<string, number>(); (usage || []).forEach(u => m.set(u.agent, (m.get(u.agent) || 0) + Number(u.cost_usd || 0))); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [usage]);
  const costTotal = cost.reduce((t, c) => t + c[1], 0);
  const summary: string[] = (sm.owner_summary || "").split("\n").filter(Boolean);

  async function runNow() { setBusy(true); const r = await runContent("evaluate", scope === "ALL" ? "all" : scope); setMsg(r.message || (r.ok ? "Started. Refresh in 2-5 minutes." : "Could not start")); setBusy(false); }

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Performance</h1><span className="sp" />
      <select value={scope} onChange={e => setScope(e.target.value)}>{sites.map(s => <option key={s.id} value={s.id}>{s.domain}</option>)}<option value="ALL">All sites (agents only)</option></select>
      {weeks.length > 0 && <select value={week} onChange={e => setWeek(e.target.value)}>{weeks.map(w => <option key={w}>{w}</option>)}</select>}
      <button disabled={busy} onClick={runNow}>Run now</button></div>
    <p className="muted small">Weekly scorecards (workflow "evaluator", Mondays). Grades come from fixed thresholds in the agent code; small samples are marked Low confidence. Lifts compare 14 days before and after a change in Search Console: that is correlation, not proof the change caused it.</p>
    {msg && <p className="small">{msg}</p>}
    {!rows.length && !msg && <p className="muted">No scorecards yet. Run the "evaluator" workflow once from GitHub Actions or press Run now.</p>}

    {site && <div className="card" style={{ marginBottom: 14 }}>
      <div className="row"><Grade g={site.grade} /><div><h2 style={{ margin: 0 }}>Site SEO outcomes</h2><span className="muted small">{site.week} · confidence {sm.confidence || "Low"}</span></div></div>
      {summary.length > 0 && <div style={{ margin: "10px 0" }}>{summary.map((l, i) => <div key={i}>{l}</div>)}<div className="muted small">{sm.summary_llm ? "Phrased by Claude from the computed lines." : "Template summary (no LLM)."}</div></div>}
      <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
        <KV k="Clicks 28d vs before" v={pc(obj(sm.gsc)?.clicks_change_28d)} sub={obj(sm.gsc)?.now ? `${num(sm.gsc.now.clicks)} clicks` : ""} />
        <KV k="Changes measured" v={num(obj(sm.lift)?.measured)} sub={obj(sm.lift) ? `${sm.lift.wins} up · ${sm.lift.losses} down · ${sm.lift.flat} flat` : ""} />
        <KV k="Open tech issues" v={num(obj(sm.tech)?.open)} sub={obj(sm.tech) ? `${sm.tech.open_critical_high} critical/high` : ""} />
        <KV k="Keyword ideas converted" v={pc(obj(sm.keyword_opps)?.conversion_rate)} sub={obj(sm.keyword_opps) ? `${sm.keyword_opps.converted} of ${sm.keyword_opps.decided} decided` : ""} />
        <KV k="Days to index (median)" v={num(obj(sm.indexing)?.median_days_to_index, 1)} sub={obj(sm.indexing) ? `${sm.indexing.indexed} of ${sm.indexing.posts} posts` : ""} />
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>{site.notes}</p></div>}

    <h2>Agents</h2>
    <div className="grid g2" style={{ marginBottom: 14 }}>
      {agents.map(a => { const m = a.metrics || {}; const p = obj(m.proposals); const r = obj(m.runs); const c = obj(m.cost); const l = obj(m.lift); return (
        <div key={a.id} className="card">
          <div className="row"><Grade g={a.grade} /><div><b>{LABEL[a.agent] || a.agent}</b><div className="muted small">{a.site_id || "all sites"} · confidence {m.confidence || "Low"} · n={m.sample?.basis_n ?? 0}</div></div></div>
          <div className="row" style={{ gap: 16, flexWrap: "wrap", margin: "10px 0" }}>
            <KV k="Proposals" v={p ? `${p.created}` : NA} sub={p ? `${p.approved} appr · ${p.rejected} rej · ${p.applied_ever} live` : ""} />
            <KV k="Approval rate" v={pc(p?.approval_rate)} sub={p ? `of ${p.decided} decided` : ""} />
            <KV k="Rollback" v={pc(p?.rollback_rate)} sub={p ? `of ${p.applied_ever} live` : ""} />
            <KV k="Failed" v={pc(p?.failed_rate)} sub={p ? `${p.verify_failed} verify-failed` : ""} />
            <KV k="Approve time" v={p?.median_hours_to_approve == null ? NA : `${p.median_hours_to_approve} h`} sub={p ? `median, n=${p.tta_n}` : ""} />
            <KV k="Runs ok" v={pc(r?.run_success_rate)} sub={r ? `${r.ok_runs}/${r.runs}` : ""} />
            <KV k="Win rate" v={pc(l?.win_rate)} sub={l ? `${l.wins} up / ${l.losses} down of ${l.measured}` : ""} />
            <KV k="Cost 28d" v={c ? `$${c.cost_usd_window.toFixed(2)}` : NA} sub={c ? (c.cost_per_applied_change == null ? "per applied: " + NA : `$${c.cost_per_applied_change.toFixed(3)} per applied`) : ""} />
          </div>
          <div className="muted small">{a.notes}</div></div>); })}
      {!agents.length && <div className="card muted">No agent rows for this week.</div>}</div>

    <div className="grid g2" style={{ marginBottom: 14 }}>
      <div className="card"><h2>Open technical issues, week by week</h2>{scope === "ALL" ? <p className="muted small">Pick a site.</p> : <Trend pts={trend} />}</div>
      <div className="card"><h2>Claude cost this month</h2>
        {usage === null ? <p className="muted small">llm_usage not readable (schema_v22.sql?). {NA}</p> : !cost.length ? <p className="muted small">No Claude calls logged this month.</p> :
          <div className="tw"><table><tbody>{cost.map(([a, v]) => <tr key={a}><td>{LABEL[a] || a}</td><td style={{ textAlign: "right" }}>${v.toFixed(3)}</td></tr>)}
            <tr><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>${costTotal.toFixed(2)}</b></td></tr></tbody></table></div>}
        <p className="muted small">Cost is an estimate from token counts and editable prices in llm.py.</p></div></div>

    {site && <>
      <div className="card" style={{ marginBottom: 14 }}><h2>Top winning changes</h2><Changes rows={sm.top_wins || []} empty={"No clear winners yet, or too few changes with enough Search Console data. " + NA} /></div>
      <div className="card" style={{ marginBottom: 14 }}><h2>Worst changes</h2><Changes rows={sm.worst_changes || []} empty="No changes with a clear drop. Rolling back is always one click on the Proposals page." />
        <p className="muted small">Changes with another edit on the same page within 28 days, or with less than 7 finished days after them, are left out on purpose.</p></div></>}
  </Shell>);
}
