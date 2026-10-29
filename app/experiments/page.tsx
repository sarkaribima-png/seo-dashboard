"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

const DAY = 864e5, WIN = 14;
const KIND: Record<string, string> = { title_meta: "Title + meta", schema: "Schema", internal_link: "Internal link", content_add: "New section" };
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const d10 = (t: number) => new Date(t).toISOString().slice(0, 10);
async function fetchAll(build: (f: number, t: number) => any) {
  let out: any[] = []; for (let i = 0; i < 30; i++) { const { data } = await build(i * 1000, i * 1000 + 999); out = out.concat(data || []); if (!data || data.length < 1000) break; } return out;
}

export default function Experiments() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [rows, setRows] = useState<any[]>([]); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  useEffect(() => { supabase.from("sites").select("id,domain").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);

  const load = useCallback(async () => {
    if (!site) return; setBusy(true);
    const { data: props } = await supabase.from("proposals").select("id,page,kind,applied_at,source,status").eq("site_id", site).eq("status", "applied").not("applied_at", "is", null).order("applied_at", { ascending: false }).limit(200);
    const list = props || []; const pages = Array.from(new Set(list.map(p => p.page)));
    if (!pages.length) { setRows([]); setBusy(false); return; }
    const minT = Math.min(...list.map(p => new Date(p.applied_at).getTime())) - (WIN + 2) * DAY, since = d10(minT);
    const [kws, rk, gs] = await Promise.all([
      supabase.from("tracked_keywords").select("keyword,page_url").eq("site_id", site).in("page_url", pages),
      fetchAll((f, t) => supabase.from("rank_daily").select("keyword,day,device,position,impressions").eq("site_id", site).gte("day", since).range(f, t)),
      fetchAll((f, t) => supabase.from("gsc_daily").select("page,date,clicks,impressions").eq("site_id", site).in("page", pages).gte("date", since).range(f, t))]);
    const kwOf: Record<string, string[]> = {}; (kws.data || []).forEach((k: any) => (kwOf[k.page_url] ||= []).push(k.keyword));
    const out = list.map(p => {
      const t0 = new Date(p.applied_at).getTime(), day0 = d10(t0);
      const inB = (d: string) => d >= d10(t0 - WIN * DAY) && d < day0, inA = (d: string) => d > d10(t0 + DAY) && d <= d10(t0 + (WIN + 1) * DAY);
      const elapsed = Math.floor((Date.now() - t0) / DAY), ready = elapsed >= WIN + 3;
      const ks = kwOf[p.page] || [];
      const pos = (dev: string, f: (d: string) => boolean) => avg(rk.filter(r => ks.includes(r.keyword) && r.device === dev && f(r.day) && r.position != null).map(r => +r.position));
      const sum = (key: string, f: (d: string) => boolean) => gs.filter(g => g.page === p.page && f(g.date)).reduce((s, g) => s + (g[key] || 0), 0);
      const m = { dB: pos("desktop", inB), dA: pos("desktop", inA), mB: pos("mobile", inB), mA: pos("mobile", inA),
        cB: sum("clicks", inB), cA: sum("clicks", inA), iB: sum("impressions", inB), iA: sum("impressions", inA) };
      const others = list.filter(o => o.id !== p.id && o.page === p.page && Math.abs(new Date(o.applied_at).getTime() - t0) < WIN * DAY).length;
      let verdict = "too early", tone = "muted";
      if (ready) {
        const better = [m.dB != null && m.dA != null ? m.dB - m.dA : 0, m.mB != null && m.mA != null ? m.mB - m.mA : 0];
        const imp = m.iB > 20 ? (m.iA - m.iB) / m.iB : 0;
        if (!ks.length && m.iB + m.iA < 20) { verdict = "not enough data"; }
        else if (Math.max(...better) >= 1 && imp > -0.2 || imp >= 0.3) { verdict = "improved"; tone = "ok"; }
        else if (Math.min(...better) <= -1.5 || imp <= -0.3) { verdict = "worse"; tone = "bad"; }
        else verdict = "no clear change";
      }
      return { ...p, elapsed, m, verdict, tone, others, ks };
    });
    setRows(out); setBusy(false);
  }, [site]);
  useEffect(() => { load(); }, [load]);

  const done = rows.filter(r => ["improved", "worse", "no clear change"].includes(r.verdict));
  const by = (k: string) => { const x = done.filter(r => r.kind === k); return { n: x.length, up: x.filter(r => r.verdict === "improved").length, down: x.filter(r => r.verdict === "worse").length }; };
  const f = (n: number | null) => (n == null ? "–" : n.toFixed(1));
  const pct = (b: number, a: number) => (b ? ((a - b) / b * 100).toFixed(0) + "%" : a ? "new" : "–");
  function copy() {
    const l = ["Experiments · " + (sites.find(s => s.id === site)?.domain || site), `Each change is compared with the ${WIN} days before and after. Position: lower is better.`, ""];
    rows.forEach(r => l.push(`${new Date(r.applied_at).toISOString().slice(0, 10)} · ${KIND[r.kind] || r.kind} · ${r.page.replace(/^https?:\/\/[^/]+/, "")} → ${r.verdict}`));
    navigator.clipboard?.writeText(l.join("\n")); setMsg("Copied.");
  }

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Experiments</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /><button onClick={load}>Refresh</button><button onClick={copy}>Copy summary</button></div>
    <p className="muted small">Every change the agent applied, compared with the {WIN} days before and the {WIN} days after (desktop and mobile position, clicks, impressions). A verdict appears only after {WIN + 3} days. If another change hit the same page in that window, the result is mixed and marked.</p>
    {msg && <p className="small">{msg}</p>}
    <div className="card small"><b>So far:</b> {done.length} change(s) measured. {Object.keys(KIND).map(k => { const s = by(k); return s.n ? <span key={k}> · {KIND[k]}: {s.up} improved, {s.down} worse, {s.n - s.up - s.down} no clear change</span> : null; })}
      {!done.length && <span className="muted"> Nothing is old enough yet.</span>}</div>
    <div className="card tw"><table><thead><tr><th>Change</th><th>Position desktop</th><th>Position mobile</th><th>Clicks</th><th>Impressions</th><th>Verdict</th></tr></thead><tbody>
      {rows.map(r => (<tr key={r.id}>
        <td className="small" style={{ minWidth: 220 }}><b>{KIND[r.kind] || r.kind}</b> <span className="muted">#{r.id} · {new Date(r.applied_at).toISOString().slice(0, 10)} ({r.elapsed}d ago)</span>
          <div className="muted">{r.page.replace(/^https?:\/\/[^/]+/, "")}</div>{r.ks.length ? <div className="muted">tracked: {r.ks.join(", ")}</div> : <div className="muted">no tracked keyword for this page</div>}
          {r.others > 0 && <div style={{ color: "#d29922" }}>mixed: {r.others} other change(s) on this page nearby</div>}</td>
        <td className="small">{f(r.m.dB)} → {f(r.m.dA)}</td><td className="small">{f(r.m.mB)} → {f(r.m.mA)}</td>
        <td className="small">{r.m.cB} → {r.m.cA} <span className="muted">({pct(r.m.cB, r.m.cA)})</span></td><td className="small">{r.m.iB} → {r.m.iA} <span className="muted">({pct(r.m.iB, r.m.iA)})</span></td>
        <td><span className={`badge ${r.tone === "ok" ? "b-applied" : r.tone === "bad" ? "b-failed" : "b-pending"}`}>{r.verdict}</span></td></tr>))}
      {!rows.length && <tr><td colSpan={6} className="muted">{busy ? "Loading…" : "No applied changes yet."}</td></tr>}</tbody></table></div>
    <p className="muted small">Read this carefully: Google moves positions on its own, so one result proves little. Look for the same kind of change helping again and again across pages. The rule used: improved = position better by 1 or more (and impressions not down 20%), or impressions up 30%; worse = position worse by 1.5 or more, or impressions down 30%.</p>
  </Shell>);
}
