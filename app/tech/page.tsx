"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

const SEV: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const EFF: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
const sevClass = (s: string) => (s === "Critical" || s === "High" ? "down" : s === "Medium" ? "" : "muted");
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

type Group = { issue: string; severity: string; why: string; fix: string; effort: string; urls: string[]; details: string[]; found: string };

export default function Tech() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [rows, setRows] = useState<any[]>([]);
  const [sev, setSev] = useState("all"); const [msg, setMsg] = useState(""); const [open, setOpen] = useState<string>("");
  const load = (s: string) => supabase.from("tech_issues").select("*").eq("site_id", s).eq("status", "open").limit(5000).then(({ data, error }) => { if (error) setMsg("Could not load: " + error.message + " (has schema_v17.sql been run?)"); setRows(data || []); });
  useEffect(() => { supabase.from("sites").select("id,domain").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  useEffect(() => { if (site) load(site); }, [site]);

  const groups: Group[] = useMemo(() => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      const g = m.get(r.issue) || { issue: r.issue, severity: r.severity, why: r.why || "", fix: r.fix || "", effort: r.effort || "", urls: [], details: [], found: r.found_at };
      if (SEV[r.severity] < SEV[g.severity]) g.severity = r.severity;
      g.urls.push(r.url); g.details.push(r.detail || ""); m.set(r.issue, g);
    }
    return [...m.values()].sort((a, b) => SEV[a.severity] - SEV[b.severity] || b.urls.length - a.urls.length);
  }, [rows]);
  // Top 5 for this week: worst severity first, then cheapest effort, then most URLs
  const top5 = useMemo(() => [...groups].sort((a, b) => SEV[a.severity] - SEV[b.severity] || (EFF[a.effort] ?? 1) - (EFF[b.effort] ?? 1) || b.urls.length - a.urls.length).slice(0, 5), [groups]);
  const list = groups.filter(g => sev === "all" || g.severity === sev);
  const count = (s: string) => rows.filter(r => r.severity === s).length;
  const last = rows.reduce((t: string, r: any) => (r.found_at > t ? r.found_at : t), "");

  async function triage(issue: string, status: "fixed" | "ignored") {
    const { error } = await supabase.from("tech_issues").update({ status }).eq("site_id", site).eq("issue", issue).eq("status", "open");
    setMsg(error ? "Could not update: " + error.message : `Marked "${issue}" as ${status}.`); load(site);
  }

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Technical SEO</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <p className="muted small">Read-only audit (robots.txt, sitemap, redirects, canonicals, noindex, titles/meta, mobile tag, schema, orphans, Core Web Vitals when a PageSpeed key is set). Runs every Monday from GitHub Actions: workflow "tech-audit". Every fix below is a proposal; nothing is changed on the site until you approve it.{last && ` Last audit: ${new Date(last).toLocaleString()}.`}</p>
    {msg && <p className="small">{msg}</p>}
    <div className="grid g4" style={{ marginBottom: 14 }}>
      {["Critical", "High", "Medium", "Low"].map(s => <div key={s} className="card kpi"><div className="l">{s}</div><div className={"v " + sevClass(s)}>{count(s)}</div></div>)}</div>

    <div className="card" style={{ marginBottom: 14 }}><h2>Top 5 fixes this week</h2>
      {!top5.length && <p className="muted">No open findings. Run the "tech-audit" workflow once (GitHub Actions) to fill this page.</p>}
      <ol style={{ margin: 0, paddingLeft: 20 }}>{top5.map(g => <li key={g.issue} style={{ marginBottom: 8 }}>
        <b>{g.issue}</b> <span className={"badge " + sevClass(g.severity)}>{g.severity}</span> <span className="muted small">{g.urls.length} URL{g.urls.length > 1 ? "s" : ""}, effort {g.effort}</span>
        <div className="small">{g.fix}</div></li>)}</ol></div>

    <div className="row tabs">{["all", "Critical", "High", "Medium", "Low"].map(k => <button key={k} className={sev === k ? "on" : ""} onClick={() => setSev(k)}>{k}</button>)}</div>
    <div className="card tw"><table><thead><tr><th>Issue</th><th>URLs affected</th><th>Severity</th><th>Why it matters</th><th>Exact fix</th><th>Effort</th><th></th></tr></thead><tbody>
      {list.map(g => (<tr key={g.issue}>
        <td><b>{g.issue}</b></td>
        <td className="small"><b>{g.urls.length}</b>
          {g.urls.slice(0, open === g.issue ? 50 : 5).map((u, i) => <div key={u + i}><a href={u} target="_blank" rel="noreferrer">{path(u)}</a>{g.details[i] && open === g.issue && <div className="muted">{g.details[i]}</div>}</div>)}
          {g.urls.length > 5 && <a href="#" onClick={e => { e.preventDefault(); setOpen(open === g.issue ? "" : g.issue); }}>{open === g.issue ? "show less" : `+${g.urls.length - 5} more / details`}</a>}</td>
        <td className={sevClass(g.severity)}><b>{g.severity}</b></td>
        <td className="small">{g.why}</td>
        <td className="small" style={{ whiteSpace: "pre-wrap", maxWidth: 380 }}><code>{g.fix.replace(/\\n/g, "\n")}</code></td>
        <td>{g.effort}</td>
        <td className="small"><button onClick={() => triage(g.issue, "fixed")}>Mark fixed</button> <button onClick={() => triage(g.issue, "ignored")}>Ignore</button></td></tr>))}
      {!list.length && <tr><td colSpan={7} className="muted">Nothing to show.</td></tr>}</tbody></table></div>
    <p className="muted small">The fix text shows the exact tag for the first affected URL; other URLs need the same change with their own address. Core Web Vitals rows appear only if PSI_API_KEY is set in GitHub secrets. Orphan-page check runs only when the whole sitemap fits in one crawl (up to 150 pages).</p>
  </Shell>);
}
