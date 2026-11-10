"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";

const IMP: Record<string, string> = { high: "var(--bad)", med: "var(--warn)", low: "var(--mut)" };
const Pill = ({ t, c }: { t: string; c?: string }) => <span className="badge" style={{ color: c || "var(--mut)" }}>{t}</span>;

export default function Plan() {
  const [sites, setSites] = useState<any[]>([]); const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState("");

  useEffect(() => {
    (async () => {
      const s = await supabase.from("sites").select("id,domain,mode,active").order("id");
      setSites((s.data || []).filter((x: any) => x.active !== false));
      const p = await supabase.from("weekly_plans").select("*").order("week", { ascending: false }).limit(400);
      if (p.error) setErr(p.error.message.includes("weekly_plans") ? "Table weekly_plans not found. Run schema_v21.sql in Supabase, then run the 'seo-orchestrator' workflow once." : p.error.message);
      setRows(p.data || []); setLoading(false);
    })();
  }, []);

  const weeks = useMemo(() => Array.from(new Set(rows.map(r => r.week))).sort().reverse(), [rows]);
  useEffect(() => { if (!week && weeks.length) setWeek(weeks[0]); }, [weeks, week]);
  const byId = useMemo(() => Object.fromEntries(rows.filter(r => r.week === week).map(r => [r.site_id, r])), [rows, week]);
  const total: number = (Object.values(byId) as any[]).reduce((n: number, r: any) => n + (r.needs_approval_count || 0), 0);

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Weekly Action Plan</h1><span className="sp" />
      {weeks.length > 0 && <select value={week} onChange={e => setWeek(e.target.value)}>{weeks.map(w => <option key={w}>{w}</option>)}</select>}
      </div>
    <p className="muted small">Plans are created every Monday by the GitHub workflow <b>seo-orchestrator</b> (to run it now: GitHub, Actions, seo-orchestrator, Run workflow).</p>
    {err && <div className="card" style={{ marginBottom: 14, borderColor: "var(--warn)" }}>{err}</div>}
    {!loading && !err && <p className="muted small">Max 5 tasks per site per week, high impact and low effort first. {total > 0 ? <b>{total} task(s) need your approval.</b> : "Nothing needs approval right now."} No change reaches a live site without your approval on the Proposals page.</p>}
    {loading && <p className="muted">Loading…</p>}
    <div className="grid g2">
      {sites.map(s => {
        const r = byId[s.id]; const p = r?.plan;
        return (<div className="card" key={s.id}>
          <div className="row" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>{s.domain}</h2><span className="sp" />
            {s.mode === "paused" && <Pill t="paused" c="var(--mut)" />}
            {r && r.needs_approval_count > 0 && <Pill t={`${r.needs_approval_count} need approval`} c="var(--warn)" />}
            {p && <Pill t={`confidence ${p.confidence || "?"}`} />}</div>
          {!p ? <p className="muted small">No plan for {week || "this week"} yet.</p> : (<>
            <p className="small" style={{ whiteSpace: "pre-line" }}>{p.summary_for_owner}</p>
            <div className="tw"><table><thead><tr><th>Task</th><th>Owner</th><th>Impact</th><th>Effort</th><th>By</th><th>Approval</th></tr></thead><tbody>
              {(p.priority_tasks || []).map((t: any, i: number) => (<tr key={i}>
                <td>{t.task}</td><td className="small">{t.agent}</td><td><Pill t={t.impact} c={IMP[t.impact]} /></td><td><Pill t={t.effort} /></td>
                <td className="small">{t.deadline || "–"}</td>
                <td>{t.needs_approval ? <Pill t="needs approval" c="var(--warn)" /> : <Pill t="no" />}</td></tr>))}
              {!(p.priority_tasks || []).length && <tr><td colSpan={6} className="muted">No tasks this week.</td></tr>}</tbody></table></div>
            {(p.risks || []).length > 0 && <><h2 style={{ marginTop: 12 }}>Risks</h2><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{p.risks.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
            <details style={{ marginTop: 10 }}><summary className="small muted">Evidence</summary><ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{(p.evidence || []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></details>
            <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>{r.needs_approval_count > 0 && <Link href="/proposals">Open Proposals</Link>}<Link href={`/site?site=${s.id}`}>Site details</Link></div></>)}
        </div>);
      })}
    </div>
    {!loading && !sites.length && <p className="muted">No sites yet. Add one on the Sites page.</p>}
  </Shell>);
}
