"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { runContent, supabase } from "@/lib/supabase";

const TABS = ["draft", "approved", "rejected", "all"];
const List = ({ title, items }: { title: string; items?: any[] }) => (items && items.length ? <div><b>{title}</b><ul>{items.map((x, i) => <li key={i}>{typeof x === "string" ? x : JSON.stringify(x)}</li>)}</ul></div> : null);

export default function Briefs() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [tab, setTab] = useState("draft");
  const [rows, setRows] = useState<any[]>([]); const [kw, setKw] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(0);
  useEffect(() => { supabase.from("sites").select("id,domain").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    let q = supabase.from("content_briefs").select("*").eq("site_id", site).order("created_at", { ascending: false }).limit(100);
    if (tab !== "all") q = q.eq("status", tab);
    const { data } = await q; setRows(data || []);
  }, [site, tab]);
  useEffect(() => { load(); }, [load]);
  async function make() { setMsg("Starting…"); const r = await runContent("briefs", site, kw.trim() ? { keyword: kw.trim() } : { limit: 5 }); setMsg(r.message); }
  async function decide(id: number, status: string) {
    setBusy(id); const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("content_briefs").update({ status, reviewed_by: u.user?.email, reviewed_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
    setBusy(0); if (error) alert(error.message + "\n\nRun schema_v19.sql in Supabase first."); else load();
  }
  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Content briefs</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <p className="muted small">A brief is a plan for a new page: keyword, intent, outline, questions, terms to cover, links to your own pages and the schema type. It does not publish anything.</p>
    <div className="card row"><input value={kw} onChange={e => setKw(e.target.value)} placeholder="Keyword (empty = use ideas that have no brief yet)" style={{ minWidth: 320 }} />
      <button disabled={!site} onClick={make}>Make brief</button>{msg && <span className="muted small">{msg}</span>}</div>
    <div className="row tabs">{TABS.map(t => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>
    {rows.map(r => { const b = r.brief || {}; return (
      <div className="card" key={r.id}>
        <div className="row"><b>{b.working_title || r.keyword}</b><span className="sp" /><span className="badge">{r.status}</span></div>
        <div className="muted small">Keyword: {r.keyword} · intent: {r.intent} · type: {r.page_type} · schema: {r.schema_type} · #{r.id}</div>
        {r.ymyl && <div className="small" style={{ color: "#d29922", margin: "6px 0" }}>Medical topic. {b.ymyl?.note}</div>}
        {r.target_url && <div className="small" style={{ margin: "6px 0" }}>{b.recommendation} <a href={r.target_url} target="_blank" rel="noreferrer">{r.target_url}</a></div>}
        <details><summary>Outline, questions and links</summary><div className="small">
          <div><b>H1:</b> {b.h1}</div><div><b>Meta draft:</b> {b.meta_description_draft}</div>
          <ol>{(b.outline || []).map((o: any, i: number) => <li key={i}>{o.h2}{(o.h3 || []).length ? <ul>{o.h3.map((x: string, j: number) => <li key={j}>{x}</li>)}</ul> : null}<div className="muted">{o.must_cover}</div></li>)}</ol>
          <List title="Questions to answer" items={b.questions} /><List title="Terms to cover" items={b.entities} />
          <List title="Internal links" items={(b.internal_links || []).map((l: any) => `“${l.anchor_text}” → ${l.link_to_url}`)} />
          <List title="Needs real input (E-E-A-T)" items={(b.eeat || []).map((e: any) => `${e.need} (${e.owner})`)} /><List title="Types of source to cite" items={b.source_types} />
          {r.ymyl && <List title="Doctor to confirm" items={b.ymyl?.doctor_to_confirm} />}<List title="Avoid" items={b.avoid} />
          <div className="muted">{b.serp_notes}</div></div></details>
        {r.status === "draft" && <div style={{ marginTop: 8 }}><button className="ok" disabled={busy === r.id} onClick={() => decide(r.id, "approved")}>Approve</button>{" "}<button className="bad" disabled={busy === r.id} onClick={() => decide(r.id, "rejected")}>Reject</button></div>}
      </div>); })}
    {!rows.length && <div className="card muted">No briefs here.</div>}
  </Shell>);
}
