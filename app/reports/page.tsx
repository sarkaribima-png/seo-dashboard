"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

type Row = { id: number; site_id: string; period: string; period_start: string; period_end: string; json: any; markdown: string; created_at: string };

// Tiny Markdown renderer for our own report format (headings, bullets, tables, bold). No raw HTML is ever injected.
function inline(t: string, k: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={k + i}>{p.slice(2, -2)}</b> : <span key={k + i}>{p}</span>));
}
function Md({ text }: { text: string }) {
  const lines = text.split("\n"); const out: any[] = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("|")) {
      const tb: string[] = []; while (i < lines.length && lines[i].startsWith("|")) tb.push(lines[i++]);
      const cells = (s: string) => s.split("|").slice(1, -1).map(c => c.trim());
      const head = cells(tb[0]), body = tb.slice(2).map(cells);
      out.push(<div className="tw" key={i}><table><thead><tr>{head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead><tbody>{body.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j} className="small">{c}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (l.startsWith("# ")) out.push(<h1 key={i}>{l.slice(2)}</h1>);
    else if (l.startsWith("## ")) out.push(<h2 key={i} style={{ marginTop: 18 }}>{l.slice(3)}</h2>);
    else if (l.startsWith("### ")) out.push(<h3 key={i}>{l.slice(4)}</h3>);
    else if (/^\s*- \[ \] /.test(l)) out.push(<div key={i} className="small" style={{ marginLeft: 16 }}>☐ {inline(l.replace(/^\s*- \[ \] /, ""), "c" + i)}</div>);
    else if (/^\s*- /.test(l)) out.push(<div key={i} className="small" style={{ marginLeft: 16 }}>• {inline(l.replace(/^\s*- /, ""), "b" + i)}</div>);
    else if (l === "---") out.push(<hr key={i} />);
    else if (/^_.*_$/.test(l.trim())) out.push(<p key={i} className="small muted" style={{ margin: "6px 0" }}><i>{l.trim().slice(1, -1)}</i></p>);
    else if (l.trim()) out.push(<p key={i} className="small" style={{ margin: "6px 0" }}>{inline(l.trim(), "p" + i)}</p>);
    i++;
  }
  return <>{out}</>;
}

export default function Reports() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState<Row | null>(null); const [msg, setMsg] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { supabase.from("sites").select("id,domain").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return; setLoading(true);
    const { data, error } = await supabase.from("reports").select("*").eq("site_id", site).order("period_start", { ascending: false }).limit(60);
    if (error) setMsg(error.message.includes("reports") ? "Reports table not found. Run schema_v20.sql in Supabase once." : error.message); else setMsg("");
    const list = (data || []) as Row[]; setRows(list); setSel(list[0] || null); setLoading(false);
  }, [site]);
  useEffect(() => { load(); }, [load]);

  async function copy() {
    if (!sel) return;
    try { await navigator.clipboard.writeText(sel.markdown); setMsg("Report copied. Paste it into WhatsApp, email or a doc."); } catch { setMsg("Copy failed. Select the text manually."); }
  }
  const alerts = (sel?.json?.alerts || []).filter((a: any) => a.severity !== "info");

  return (<Shell>
    <style>{`@media print{.nav,.noprint{display:none!important}body{background:#fff;color:#000}.card{border:none;padding:0}}`}</style>
    <div className="row noprint"><h1 style={{ margin: 0 }}>Reports</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} />
      <button onClick={load}>Refresh</button><button onClick={copy} disabled={!sel}>Copy report</button><button onClick={() => window.print()} disabled={!sel}>Print / PDF</button></div>
    <p className="muted small noprint">Weekly report (every Monday) and monthly report, made from Search Console data only. Changes in position and clicks show a pattern, not a proven reason. Run it now: GitHub Actions → report → Run workflow.</p>
    {msg && <p className="small noprint">{msg}</p>}
    <div className="grid" style={{ gridTemplateColumns: "minmax(200px,260px) 1fr", alignItems: "start" }}>
      <div className="card noprint">{rows.map(r => (
        <div key={r.id} onClick={() => setSel(r)} style={{ cursor: "pointer", padding: "8px 6px", borderRadius: 8, background: sel?.id === r.id ? "var(--line)" : undefined }}>
          <b>{r.period === "week" ? "Weekly" : "Monthly"}</b> <span className="muted small">{r.period_start} → {r.period_end}</span>
          <div className="small muted">{(r.json?.alerts || []).filter((a: any) => a.severity !== "info").length} alert · confidence {r.json?.confidence || "–"}</div></div>))}
        {!rows.length && <span className="muted small">{loading ? "Loading…" : "No reports yet. Run the “report” workflow (or: python -m seo_agent.report <site> --period week)."}</span>}</div>
      <div className="card">{sel ? <>
        {alerts.length > 0 && <div className="noprint" style={{ borderLeft: "4px solid var(--bad)", paddingLeft: 10, marginBottom: 10 }}><b>{alerts.length} alert</b><div className="small muted">{alerts.slice(0, 3).map((a: any, i: number) => <div key={i}>• {a.title}</div>)}</div></div>}
        <Md text={sel.markdown} /></> : <span className="muted">Select a report.</span>}</div>
    </div>
  </Shell>);
}
