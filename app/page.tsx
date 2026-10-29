"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import Shell from "@/components/Shell";
import { runAgent, supabase } from "@/lib/supabase";

const DAY = 864e5;
const d10 = (t: number) => new Date(t).toISOString().slice(0, 10);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sum = (a: any[], k: string) => a.reduce((s, r) => s + (+r[k] || 0), 0);
const wpos = (a: any[]) => { const i = sum(a, "impressions"); return i ? a.reduce((s, r) => s + (+r.position || 0) * (+r.impressions || 0), 0) / i : null; };
const pct = (n: number, p: number) => (p > 0 ? ((n - p) / p) * 100 : null);
const bucket = (p: number) => (p <= 3 ? 0 : p <= 10 ? 1 : p <= 20 ? 2 : 3);
const BUCKETS = ["#1–3", "#4–10", "#11–20", "#21+"];
async function fetchAll(build: (f: number, t: number) => any) {
  let out: any[] = []; for (let i = 0; i < 40; i++) { const { data } = await build(i * 1000, i * 1000 + 999); out = out.concat(data || []); if (!data || data.length < 1000) break; } return out;
}

function Delta({ v, inv }: { v: number | null; inv?: boolean }) {
  if (v == null || !isFinite(v)) return null;
  const good = inv ? v < 0 : v > 0;
  return <span className={good ? "up" : "down"} style={{ fontSize: 12 }}> {v > 0 ? "▲" : "▼"} {Math.abs(v).toFixed(0)}%</span>;
}
function Spark({ data, color }: { data: { v: number }[]; color: string }) {
  if (data.length < 2) return <div style={{ height: 44 }} className="muted small">no data yet</div>;
  return <div style={{ height: 44 }}><ResponsiveContainer><AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}><Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.18} strokeWidth={1.5} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>;
}

export default function Projects() {
  const [sites, setSites] = useState<any[]>([]); const [gsc, setGsc] = useState<any[]>([]); const [kws, setKws] = useState<any[]>([]); const [rk, setRk] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]); const [props, setProps] = useState<any[]>([]); const [posts, setPosts] = useState<any[]>([]);
  const [dev, setDev] = useState<"desktop" | "mobile">("desktop"); const [msg, setMsg] = useState(""); const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const s = await supabase.from("sites").select("*").order("id"); setSites((s.data || []).filter((x: any) => x.active !== false));
      const since = d10(Date.now() - 60 * DAY), since2 = d10(Date.now() - 24 * DAY);
      const [g, k, r, a, p, c] = await Promise.all([
        fetchAll((f, t) => supabase.from("gsc_by_day").select("site_id,date,device,clicks,impressions,position").gte("date", since).range(f, t)),
        supabase.from("tracked_keywords").select("site_id,keyword,active"),
        fetchAll((f, t) => supabase.from("rank_daily").select("site_id,keyword,day,device,position").gte("day", since2).range(f, t)),
        fetchAll((f, t) => supabase.from("page_audits").select("site_id,page,h1,images_no_alt,risky_claims,schema_issues,audited_at").order("audited_at", { ascending: false }).range(f, t)),
        fetchAll((f, t) => supabase.from("proposals").select("site_id,status").range(f, t)),
        fetchAll((f, t) => supabase.from("content_posts").select("site_id,status").range(f, t))]);
      setGsc(g); setKws((k.data || []).filter((x: any) => x.active !== false)); setRk(r); setAudits(a); setProps(p); setPosts(c); setLoading(false);
    })();
  }, []);

  const cards = useMemo(() => sites.map(site => {
    const id = site.id, now = Date.now(), c1 = d10(now - 28 * DAY), c0 = d10(now - 56 * DAY);
    const g = gsc.filter(r => r.site_id === id), cur = g.filter(r => r.date >= c1), prev = g.filter(r => r.date >= c0 && r.date < c1);
    const byDay = (key: string) => { const m: Record<string, number> = {}; cur.forEach(r => { m[r.date] = (m[r.date] || 0) + (+r[key] || 0); }); return Object.keys(m).sort().map(d => ({ v: m[d] })); };
    const D = dev.toUpperCase();
    const pos = wpos(cur.filter(r => r.device === D)), posPrev = wpos(prev.filter(r => r.device === D));
    // tracked keywords: last 3 days vs the 7 days before, by position bucket
    const ks = kws.filter(k => k.site_id === id).map(k => k.keyword); const rows = rk.filter(r => r.site_id === id && r.device === dev);
    const last = d10(now - 3 * DAY), mid = d10(now - 10 * DAY); const counts = [0, 0, 0, 0], before = [0, 0, 0, 0]; let tracked = 0;
    ks.forEach(k => {
      const r = rows.filter(x => x.keyword === k && x.position != null);
      const a = avg(r.filter(x => x.day >= last).map(x => +x.position)) ?? avg(r.sort((x, y) => y.day.localeCompare(x.day)).slice(0, 3).map(x => +x.position));
      const b = avg(r.filter(x => x.day < last && x.day >= mid).map(x => +x.position));
      if (a != null) { counts[bucket(a)]++; tracked++; } if (b != null) before[bucket(b)]++;
    });
    // health: share of audited pages with no issue
    const seen = new Set<string>(); const pages: any[] = [];
    audits.filter(a => a.site_id === id).forEach(a => { if (!seen.has(a.page)) { seen.add(a.page); pages.push(a); } });
    const issue = (a: any) => a.h1 !== 1 || (a.images_no_alt || 0) > 0 || (a.risky_claims || []).length > 0 || (a.schema_issues || []).length > 0;
    const bad = pages.filter(issue).length, health = pages.length ? Math.round(100 * (pages.length - bad) / pages.length) : null;
    const pr = props.filter(p => p.site_id === id), cnt = (s: string) => pr.filter(p => p.status === s).length;
    const po = posts.filter(p => p.site_id === id);
    return { site, clicks: sum(cur, "clicks"), clicksP: sum(prev, "clicks"), impr: sum(cur, "impressions"), imprP: sum(prev, "impressions"), cs: byDay("clicks"), is: byDay("impressions"),
      pos, posPrev, counts, before, tracked, ntracked: ks.length, health, pages: pages.length, noAlt: pages.filter(a => (a.images_no_alt || 0) > 0).length, badH1: pages.filter(a => a.h1 !== 1).length,
      risky: pages.filter(a => (a.risky_claims || []).length).length, pending: cnt("pending"), approved: cnt("approved"), applied: cnt("applied"), failed: cnt("failed"),
      published: po.filter(p => p.status === "published").length, drafts: po.filter(p => p.status === "draft").length };
  }), [sites, gsc, kws, rk, audits, props, posts, dev]);

  async function setMode(site: any, mode: string) {
    if (mode === "live" && !confirm("Live mode: approved AND new title/meta proposals will be applied to the site (1 page/day). Continue?")) return;
    const { error } = await supabase.from("sites").update({ mode }).eq("id", site.id);
    if (error) alert(error.message); else setSites(sites.map(s => (s.id === site.id ? { ...s, mode } : s)));
  }
  async function run(cmd: string, id?: string) { setMsg("Starting…"); const r = await runAgent(cmd, undefined, id); setMsg(r.message); }
  const f1 = (x: number | null) => (x == null ? "–" : x.toFixed(1));
  const hcol = (h: number | null) => (h == null ? "var(--mut)" : h >= 90 ? "var(--ok)" : h >= 70 ? "var(--warn)" : "var(--bad)");

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Projects</h1><span className="muted small">last 28 days</span><span className="sp" />
      <select value={dev} onChange={e => setDev(e.target.value as any)}><option value="desktop">Position: Desktop</option><option value="mobile">Position: Mobile</option></select>
      <button onClick={() => run("daily")}>Run all sites now</button><Link href="/sites"><button className="ok">+ Add site</button></Link></div>
    {msg && <p className="muted small">{msg}</p>}
    {loading && <p className="muted">Loading…</p>}
    {cards.map(c => (<div key={c.site.id} className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--acc)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>{c.site.domain[0].toUpperCase()}</div>
        <div><b>{c.site.domain}</b> <span className="badge">{c.site.type === "static" ? "HTML" : "WordPress"}</span><div className="muted small">{c.site.gsc_property}</div></div><span className="sp" />
        <select value={c.site.mode} onChange={e => setMode(c.site, e.target.value)}><option value="dry-run">dry-run</option><option value="live">live</option><option value="paused">paused</option></select>
        <button onClick={() => run("daily", c.site.id)}>Run now</button><Link href={`/site?site=${c.site.id}`}><button>Details</button></Link></div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 18 }}>
        <div><div className="muted small">Health score</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <div style={{ width: 54, height: 54, borderRadius: "50%", border: `4px solid ${hcol(c.health)}`, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 18 }}>{c.health ?? "–"}</div>
            <div className="small muted">{c.pages ? <>{c.pages} pages audited<br />{c.noAlt} no alt · {c.badH1} H1 issue{c.risky ? <> · {c.risky} risky claim</> : null}</> : <a href="#" onClick={e => { e.preventDefault(); run("audit-all", c.site.id); }}>Run site audit</a>}</div></div></div>
        <div><div className="muted small">Clicks</div><div style={{ fontSize: 24, fontWeight: 700 }}>{c.clicks.toLocaleString()}<Delta v={pct(c.clicks, c.clicksP)} /></div><Spark data={c.cs} color="#1f6feb" /></div>
        <div><div className="muted small">Impressions</div><div style={{ fontSize: 24, fontWeight: 700 }}>{c.impr.toLocaleString()}<Delta v={pct(c.impr, c.imprP)} /></div><Spark data={c.is} color="#8957e5" /></div>
        <div><div className="muted small">Avg position · {dev}</div><div style={{ fontSize: 24, fontWeight: 700 }}>{f1(c.pos)}<Delta v={c.pos && c.posPrev ? pct(c.pos, c.posPrev) : null} inv /></div>
          <div className="small muted" style={{ marginTop: 6 }}>lower is better<br />clicks and impressions come from Search Console</div></div>
        <div><div className="muted small">Tracked keywords <b style={{ color: "var(--ink)" }}>{c.tracked}</b>{c.ntracked > c.tracked ? ` of ${c.ntracked}` : ""}</div>
          <table style={{ marginTop: 4 }}><tbody>{BUCKETS.map((b, i) => { const d = c.counts[i] - c.before[i]; return (<tr key={b}><td className="small" style={{ padding: "2px 6px" }}>{b}</td><td className="small" style={{ padding: "2px 6px", fontWeight: 700 }}>{c.counts[i]}</td>
            <td className="small" style={{ padding: "2px 6px", color: d === 0 ? "var(--mut)" : (i < 2 ? d > 0 : d < 0) ? "var(--ok)" : "var(--bad)" }}>{d === 0 ? "=" : (d > 0 ? "▲ " : "▼ ") + Math.abs(d)}</td></tr>); })}</tbody></table>
          {!c.ntracked && <Link href="/tracking" className="small">Add keywords →</Link>}</div>
        <div><div className="muted small">Agent work</div>
          <div className="small" style={{ marginTop: 4 }}><Link href="/proposals"><b>{c.pending}</b> waiting for approval</Link><br />{c.approved} approved · {c.applied} applied · {c.failed} failed<br />{c.published} posts published{c.drafts ? ` · ${c.drafts} drafts` : ""}</div></div>
      </div></div>))}
    {!loading && !sites.length && <p className="muted">No sites yet. <Link href="/sites">Add your first site</Link>.</p>}
  </Shell>);
}
