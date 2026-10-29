"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

export default function Rank() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [jobs, setJobs] = useState<any[]>([]);
  const [kw, setKw] = useState(""); const [page, setPage] = useState(""); const [comp, setComp] = useState(""); const [msg, setMsg] = useState("");
  useEffect(() => { supabase.from("sites").select("*").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    const { data } = await supabase.from("rank_jobs").select("*").eq("site_id", site).order("created_at", { ascending: false }).limit(50); setJobs(data || []);
  }, [site]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const urls = comp.split(/\s+/).map(x => x.trim()).filter(Boolean);
    const own = page.trim(); const dom = sites.find(s => s.id === site)?.domain?.replace(/^www\./, "") || "";
    if (!kw.trim() || !/^https?:\/\//.test(own)) return setMsg("Enter a keyword and your full page URL (https://…).");
    if (dom && !own.includes(dom)) return setMsg("Your page must be on " + dom);
    if (!urls.length || urls.some(u => !/^https?:\/\//.test(u))) return setMsg("Add at least one competitor page URL (full https://… link).");
    const { error } = await supabase.from("rank_jobs").insert({ site_id: site, keyword: kw.trim(), page_url: own, competitor_urls: urls.slice(0, 3) });
    if (error) return setMsg(error.message);
    setKw(""); setPage(""); setComp(""); setMsg("Added. Press “Run audits now”."); load();
  }
  async function run() {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/content-run", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ site, command: "rank" }) });
    const j = await r.json().catch(() => ({})); setMsg(j.message || j.error || "");
  }
  async function retry(id: number) { await supabase.from("rank_jobs").update({ status: "queued", error: null }).eq("id", id); load(); }

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Rank a page</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /><button onClick={run}>Run audits now</button><button onClick={load}>Refresh</button></div>
    <p className="muted small">Give a keyword, the page that should rank, and 1–3 competitor pages already ranking. The audit tool compares them, then the agent prepares the fixes. You only approve them in Proposals.</p>
    {msg && <p className="small">{msg}</p>}
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <input placeholder="Keyword, e.g. liposuction cost in gurgaon" value={kw} onChange={e => setKw(e.target.value)} />
      <input placeholder="Your page URL (https://www.kalosa.in/…)" value={page} onChange={e => setPage(e.target.value)} />
      <textarea rows={3} placeholder="Competitor page URLs, one per line (max 3)" value={comp} onChange={e => setComp(e.target.value)} />
      <div><button className="ok" onClick={add}>Add to queue</button></div>
    </div>
    <div className="card tw"><table><thead><tr><th>Keyword / page</th><th>Status</th><th>Result</th><th></th></tr></thead><tbody>
      {jobs.map(j => (<tr key={j.id}>
        <td className="small" style={{ minWidth: 240 }}><b>{j.keyword}</b><div><a href={j.page_url} target="_blank" rel="noreferrer">{j.page_url.replace(/^https?:\/\/[^/]+/, "")}</a></div><div className="muted">vs {(j.competitor_urls || []).length} competitor page(s)</div></td>
        <td><span className={`badge b-${j.status === "ready" ? "applied" : j.status === "failed" ? "failed" : "pending"}`}>{j.status}</span></td>
        <td className="small" style={{ minWidth: 300 }}>
          {j.status === "ready" && <><div>{j.proposals_made} proposal(s) waiting in Proposals</div>
            {(j.report?.hypothesis || []).slice(0, 3).map((h: string, i: number) => <div key={i} className="muted">• {h}</div>)}
            {j.report?.confidence != null && <div className="muted">confidence: {String(j.report.confidence)}</div>}</>}
          {j.status === "failed" && <div className="muted">{j.error}</div>}
          {j.status === "auditing" && <div className="muted">Audit running. It continues on the next run if it takes long.</div>}</td>
        <td>{j.status === "failed" && <button onClick={() => retry(j.id)}>Retry</button>}</td></tr>))}
      {!jobs.length && <tr><td colSpan={4} className="muted">No jobs yet.</td></tr>}</tbody></table></div>
  </Shell>);
}
