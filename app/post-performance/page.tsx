"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

const DAY = 864e5;
function verdict(days: number, s: any) {
  if (!s) return { t: "no data yet", tone: "pending", hint: "Press “Update now”." };
  if (days < 3) return { t: "just published", tone: "pending", hint: "Google usually needs a few days." };
  if (s.indexed === false) return days >= 7 ? { t: "not indexed", tone: "failed", hint: "Open “Request indexing” and ask Google to crawl it. Check there is an internal link to this post." } : { t: "not indexed yet", tone: "pending", hint: "Wait a few more days." };
  if (!s.impressions) return days >= 14 ? { t: "indexed, no impressions", tone: "failed", hint: "Google knows the page but shows it to nobody. Add internal links to it and check the title matches the search." } : { t: "indexed, waiting", tone: "pending", hint: "" };
  if (s.position != null && s.position <= 10) return { t: "page 1", tone: "applied", hint: "Good. Now work on the title and meta to win clicks." };
  if (s.position != null && s.position <= 20) return { t: "page 2", tone: "pending", hint: "Close. Add internal links and improve the section that matches the best query." };
  return { t: "low position", tone: "pending", hint: "Check the top queries below and see if the post answers them." };
}

export default function PostPerf() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [posts, setPosts] = useState<any[]>([]); const [perf, setPerf] = useState<any[]>([]); const [msg, setMsg] = useState("");
  useEffect(() => { supabase.from("sites").select("*").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    const since = new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10);
    const [p, f] = await Promise.all([
      supabase.from("content_posts").select("id,title,publish_url,published_at").eq("site_id", site).eq("status", "published").order("published_at", { ascending: false }).limit(100),
      supabase.from("post_perf").select("*").eq("site_id", site).gte("day", since).order("day", { ascending: false }).limit(3000)]);
    setPosts(p.data || []); setPerf(f.data || []);
  }, [site]);
  useEffect(() => { load(); }, [load]);

  async function run() {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/content-run", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ site, command: "postperf" }) });
    const j = await r.json().catch(() => ({})); setMsg(j.message || j.error || "");
  }
  const prop = encodeURIComponent((sites.find(x => x.id === site)?.gsc_property) || "");
  const rows = posts.map(p => {
    const mine = perf.filter(x => x.post_id === p.id); const now = mine[0];
    const old = mine.find(x => new Date(now?.day).getTime() - new Date(x.day).getTime() >= 6 * DAY);
    const days = p.published_at ? Math.floor((Date.now() - new Date(p.published_at).getTime()) / DAY) : 0;
    const kwq = now?.queries?.find((q: any) => q.q === (now.keyword || "").toLowerCase());
    return { p, now, old, days, kwq, v: verdict(days, now) };
  });
  const cnt = (t: string) => rows.filter(r => r.v.t === t).length;

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Post performance</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /><button onClick={run}>Update now</button><button onClick={load}>Refresh</button></div>
    <p className="muted small">How each published post is doing in Google: is it indexed, how many people saw it, where it ranks, and for which searches. Data from Search Console (about 2 days behind), refreshed every day.</p>
    {msg && <p className="small">{msg}</p>}
    <div className="card small"><b>{rows.length}</b> published · {rows.filter(r => r.now?.indexed).length} indexed · {rows.filter(r => r.now?.impressions > 0).length} getting impressions · {cnt("page 1")} on page 1 · {cnt("not indexed")} need indexing</div>
    <div className="card tw"><table><thead><tr><th>Post</th><th>Google</th><th>Last 28 days</th><th>Status</th></tr></thead><tbody>
      {rows.map(({ p, now, old, days, kwq, v }) => (<tr key={p.id}>
        <td className="small" style={{ minWidth: 240 }}><a href={p.publish_url} target="_blank" rel="noreferrer"><b>{p.title}</b></a><div className="muted">published {p.published_at ? new Date(p.published_at).toLocaleDateString() : "–"} · {days} day(s) ago</div>
          {now?.keyword && <div className="muted">target: {now.keyword}{kwq ? ` · position ${kwq.pos}` : now.impressions ? " · not among its queries yet" : ""}</div>}</td>
        <td className="small" style={{ minWidth: 150 }}>{now ? now.coverage || "–" : "–"}{now?.last_crawl && <div className="muted">crawled {new Date(now.last_crawl).toLocaleDateString()}</div>}
          {now?.indexed === false && <div><a href={`https://search.google.com/search-console/inspect?resource_id=${prop}&id=${encodeURIComponent(p.publish_url)}`} target="_blank" rel="noreferrer">Request indexing ↗</a></div>}</td>
        <td className="small">{now ? <>{now.impressions} impressions{old && <span className="muted"> ({now.impressions - old.impressions >= 0 ? "+" : ""}{now.impressions - old.impressions} vs 7d ago)</span>}<div>{now.clicks} clicks · avg position {now.position ?? "–"}</div></> : "–"}
          {now?.queries?.length > 0 && <details><summary className="muted">Top searches</summary>{now.queries.slice(0, 8).map((q: any, i: number) => <div key={i} className="muted">{q.q} · pos {q.pos} · {q.impr} impr</div>)}</details>}</td>
        <td className="small" style={{ minWidth: 200 }}><span className={`badge b-${v.tone}`}>{v.t}</span><div className="muted">{v.hint}</div></td></tr>))}
      {!rows.length && <tr><td colSpan={4} className="muted">No published posts yet.</td></tr>}</tbody></table></div>
  </Shell>);
}
