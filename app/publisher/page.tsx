"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

const istDay = (d = new Date()) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);   // UTC+5:30 calendar day
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
const idxClass = (s: string) => (s === "indexed" ? "up" : s === "not_indexed" || s === "blocked" ? "down" : "muted");

export default function Publisher() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState("");
  const [log, setLog] = useState<any[]>([]); const [queue, setQueue] = useState<any[]>([]); const [tasks, setTasks] = useState<any[]>([]); const [msg, setMsg] = useState("");
  const [quota, setQuota] = useState<any[]>([]);
  const today = istDay();
  useEffect(() => {
    supabase.from("sites").select("id,domain,posts_per_day,profile,reviewer_required,publish_window_start,publish_window_end,mode").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); });
    supabase.from("publish_log").select("site_id,cap_day").eq("cap_day", today).then(({ data, error }) => { if (error) setMsg("Could not load: " + error.message + " (has schema_v25.sql been run?)"); setQuota(data || []); });
  }, []);
  const load = (s: string) => {
    supabase.from("publish_log").select("*").eq("site_id", s).order("published_at", { ascending: false }).limit(60).then(({ data }) => setLog(data || []));
    supabase.from("content_posts").select("id,title,status,approved_at,reviewed_at,issues").eq("site_id", s).in("status", ["approved", "draft"]).order("approved_at", { ascending: true }).limit(60).then(({ data }) => setQueue(data || []));
    supabase.from("publisher_tasks").select("*").eq("site_id", s).eq("status", "open").order("created_at", { ascending: false }).limit(100).then(({ data }) => setTasks(data || []));
  };
  useEffect(() => { if (site) load(site); }, [site]);
  async function done(id: number, status: "done" | "ignored") {
    const { error } = await supabase.from("publisher_tasks").update({ status }).eq("id", id).eq("status", "open");
    setMsg(error ? "Could not update: " + error.message : "Task marked " + status + "."); load(site);
  }
  const cur = sites.find(s => s.id === site);
  const approved = queue.filter(q => q.status === "approved");
  const gateIssues = (q: any) => (q.issues || []).filter((i: string) => String(i).startsWith("publisher gate"));
  const waitingReview = (q: any) => (cur?.reviewer_required || cur?.profile === "medical") && !q.reviewed_at;

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Publisher</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <p className="muted small">Hourly workflow "publisher". Publishes only inside the IST window, never above the daily cap (counted per UTC+5:30 day), only approved posts that pass the quality gates. Medical sites need the reviewer's approval first. Index checks run at day 1, 3 and 7. Today (IST): {today}.</p>
    {msg && <p className="small">{msg}</p>}

    <div className="card tw" style={{ marginBottom: 14 }}><h2>Today's quota</h2><table><thead><tr><th>Site</th><th>Published today</th><th>Daily cap</th><th>Window (IST)</th><th>Mode</th></tr></thead><tbody>
      {sites.map(s => { const n = quota.filter(q => q.site_id === s.id).length; const cap = s.posts_per_day ?? 1;
        return (<tr key={s.id}><td>{s.domain}</td><td className={n >= cap ? "down" : ""}><b>{n}</b></td><td>{cap}</td><td>{s.publish_window_start ?? 9}:00 to {s.publish_window_end ?? 21}:00</td><td>{s.mode}</td></tr>); })}
      {!sites.length && <tr><td colSpan={5} className="muted">No sites.</td></tr>}</tbody></table>
      <p className="muted small">The cap shown is the site setting. The agent also clamps it to PUBLISHER_MAX_POSTS_PER_DAY (default 5). Posts published by the older content workflow are counted by the agent but not in the "published today" number here.</p></div>

    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginBottom: 14 }}>
      <div className="card tw"><h2>Queue</h2><table><thead><tr><th>Post</th><th>State</th></tr></thead><tbody>
        {queue.map(q => (<tr key={q.id}><td>{q.title}</td><td className="small">
          {q.status === "approved" ? (waitingReview(q) ? <span className="down">waiting for reviewer</span> : "ready for next slot") : <span className="muted">sent back to draft</span>}
          {gateIssues(q).map((i: string, k: number) => <div key={k} className="muted">{i}</div>)}</td></tr>))}
        {!queue.length && <tr><td colSpan={2} className="muted">Nothing approved is waiting.</td></tr>}</tbody></table>
        <p className="muted small">{approved.length} approved post(s) waiting.</p></div>

      <div className="card tw"><h2>Open tasks</h2>
        {!tasks.length && <p className="muted">No open tasks.</p>}
        {tasks.map(t => (<div key={t.id} style={{ marginBottom: 10 }}><b>{t.title}</b> <span className="badge">{t.assignee}</span> <span className="muted small">{t.kind}, confidence {t.confidence}</span>
          <div className="small"><a href={t.url} target="_blank" rel="noreferrer">{path(t.url)}</a></div>
          {t.detail && <div className="small" style={{ whiteSpace: "pre-wrap" }}>{t.detail}</div>}
          <button onClick={() => done(t.id, "done")}>Done</button> <button onClick={() => done(t.id, "ignored")}>Ignore</button></div>))}</div>
    </div>

    <div className="card tw"><h2>Publish log and index status</h2><table><thead><tr><th>Published (IST day)</th><th>URL</th><th>Index</th><th>Day 1</th><th>Day 3</th><th>Day 7</th><th>Sitemap</th><th>Links</th></tr></thead><tbody>
      {log.map(r => { const c = r.checked_at || {}; const cell = (k: string) => (c[k] ? <span className={idxClass(c[k].status)}>{c[k].status}</span> : <span className="muted">-</span>);
        return (<tr key={r.id}><td className="small">{new Date(r.published_at).toLocaleString()}<div className="muted">{r.cap_day}</div></td>
          <td className="small"><a href={r.url} target="_blank" rel="noreferrer">{path(r.url)}</a></td>
          <td className={idxClass(r.index_status)}><b>{r.index_status}</b></td><td>{cell("d1")}</td><td>{cell("d3")}</td><td>{cell("d7")}</td>
          <td className="small">{r.sitemap ? (r.sitemap.listed === true ? "listed" : r.sitemap.listed === false ? <span className="down">not listed</span> : "DATA NOT AVAILABLE") : "-"}</td>
          <td className="small">{r.links ? `${r.links.proposals_in} in / ${r.links.proposals_out} out proposed, ${r.links.existing_internal_links_out} existing` : "-"}</td></tr>); })}
      {!log.length && <tr><td colSpan={8} className="muted">Nothing published by the Publisher yet.</td></tr>}</tbody></table>
      <p className="muted small">"DATA NOT AVAILABLE" means Google Search Console URL Inspection could not be read for this site; check the page in GSC by hand. Link proposals are pending on the Proposals page and need approval.</p></div>
  </Shell>);
}
