"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";
import { readCsv, num, bool } from "@/lib/csv";

const WORDS = [600, 800, 1000, 1200, 1500, 2000, 2500];
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const fmt = (n: any) => (n == null ? "–" : Math.round(Number(n)).toLocaleString());

export default function Content() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState("");
  const [comp, setComp] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [ideas, setIdeas] = useState<any[]>([]); const [counts, setCounts] = useState({ pages: 0, kws: 0 });
  const [filter, setFilter] = useState("suggested"); const [words, setWords] = useState<Record<number, number>>({});

  useEffect(() => { supabase.from("sites").select("id").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    const [i, p, k] = await Promise.all([
      supabase.from("content_ideas").select("*").eq("site_id", site).order("created_at", { ascending: false }).limit(300),
      supabase.from("competitor_pages").select("id", { count: "exact", head: true }).eq("site_id", site),
      supabase.from("competitor_keywords").select("id", { count: "exact", head: true }).eq("site_id", site)]);
    setIdeas(i.data || []); setCounts({ pages: p.count || 0, kws: k.count || 0 });
  }, [site]);
  useEffect(() => { load(); }, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    if (!comp.trim()) { alert("Type the competitor domain first (e.g. example.com)."); return; }
    setBusy(true); setMsg("Reading file…");
    try {
      const rows = await readCsv(f); const h = Object.keys(rows[0] || {}); const competitor = comp.trim().toLowerCase();
      if (h.includes("Current top keyword")) {
        const m = new Map<string, any>();
        rows.forEach(r => r.URL && m.set(r.URL, { site_id: site, competitor, url: r.URL, traffic: num(r["Current traffic"]) ?? 0,
          keywords_count: Math.round(num(r["Current # of keywords"]) ?? 0), top_keyword: r["Current top keyword"] || null,
          top_kw_volume: num(r["Current top keyword: Volume"]), top_kw_position: num(r["Current top keyword: Position"]), page_type: r["Page type"] || null }));
        for (const c of chunks([...m.values()], 400)) { const { error } = await supabase.from("competitor_pages").upsert(c, { onConflict: "site_id,competitor,url" }); if (error) throw error; }
        setMsg(`Imported ${m.size} pages ✓`);
      } else if (h.includes("Keyword") && h.includes("Volume")) {
        const m = new Map<string, any>();
        rows.forEach(r => r.Keyword && m.set(r.Keyword.toLowerCase(), { site_id: site, competitor, keyword: r.Keyword, volume: num(r.Volume), kd: num(r.KD), cpc: num(r.CPC),
          position: num(r["Current position"]), traffic: num(r["Current organic traffic"]) ?? 0, url: r["Current URL"] || null, branded: bool(r.Branded),
          informational: bool(r.Informational), commercial: bool(r.Commercial), transactional: bool(r.Transactional), serp_features: r["SERP features"] || null }));
        for (const c of chunks([...m.values()], 400)) { const { error } = await supabase.from("competitor_keywords").upsert(c, { onConflict: "site_id,competitor,keyword" }); if (error) throw error; }
        setMsg(`Imported ${m.size} keywords ✓`);
      } else setMsg("Unknown file. Use an Ahrefs 'Top pages' or 'Organic keywords' export.");
    } catch (err: any) { setMsg("Failed: " + (err.message || err)); }
    setBusy(false); load();
  }
  async function generate() {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/content-run", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ site }) });
    const j = await r.json().catch(() => ({})); setMsg(j.message || j.error || "");
  }
  async function decide(id: number, status: "approved" | "rejected") {
    await supabase.from("content_ideas").update({ status, word_count: status === "approved" ? (words[id] || 1200) : null, decided_at: new Date().toISOString() }).eq("id", id); load();
  }
  const shown = ideas.filter(i => filter === "all" || i.status === filter);

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Content ideas</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <div className="card" style={{ marginBottom: 14 }}><h2>1. Competitor data</h2>
      <p className="muted small">Upload Ahrefs exports: "Top pages" and/or "Organic keywords". Data stored: {counts.pages} pages, {counts.kws} keywords.</p>
      <div className="grid g2"><input placeholder="Competitor domain, e.g. example.com" value={comp} onChange={e => setComp(e.target.value)} />
        <input type="file" accept=".csv,.tsv,.txt" onChange={upload} disabled={busy} /></div>
      <div className="row" style={{ marginTop: 10, marginBottom: 0 }}><button className="pri" onClick={generate} disabled={busy || (!counts.pages && !counts.kws)}>2. Suggest topics</button>
        <span className="muted small">{msg}</span></div></div>
    <div className="row tabs">{["suggested", "approved", "rejected", "all"].map(s => <button key={s} className={filter === s ? "on" : ""} onClick={() => setFilter(s)}>{s}</button>)}</div>
    <div className="card tw"><table><thead><tr><th>Topic</th><th>Keyword</th><th>Volume</th><th>KD</th><th>Words</th><th></th></tr></thead><tbody>
      {shown.map(i => (<tr key={i.id}>
        <td className="small" style={{ minWidth: 260 }}><b>{i.title}</b><div className="muted">{i.post_type} · {i.intent}{i.why ? " · " + i.why : ""}</div></td>
        <td className="small">{i.primary_keyword}<div className="muted">{(i.secondary_keywords || []).slice(0, 3).join(", ")}</div></td>
        <td className="small">{fmt(i.volume)}</td><td className="small">{fmt(i.kd)}</td>
        <td>{i.status === "suggested" ? <select value={words[i.id] || 1200} onChange={e => setWords({ ...words, [i.id]: +e.target.value })}>{WORDS.map(w => <option key={w} value={w}>{w}</option>)}</select> : <span className="small">{i.word_count || "–"}</span>}</td>
        <td style={{ whiteSpace: "nowrap" }}>{i.status === "suggested" ? <><button className="ok" onClick={() => decide(i.id, "approved")}>Approve</button> <button onClick={() => decide(i.id, "rejected")}>Reject</button></> : <span className={`badge ${i.status === "approved" ? "b-applied" : "b-pending"}`}>{i.status}</span>}</td></tr>))}
      {!shown.length && <tr><td colSpan={6} className="muted">Nothing here yet.</td></tr>}</tbody></table></div>
  </Shell>);
}
