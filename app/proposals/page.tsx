"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { runAgent, supabase } from "@/lib/supabase";

// Where a new section goes. A position is "before_faq" | "after_faq" | "end" | { after_heading, occurrence }.
const posMode = (p: any) => (p && typeof p === "object" ? "after_heading" : p || "before_faq");
const posLabel = (p: any) => (p && typeof p === "object" ? `after the heading “${p.after_heading}”${p.occurrence > 1 ? ` (#${p.occurrence})` : ""}` : ({ before_faq: "before the FAQ", after_faq: "after the FAQ", end: "end of the page" } as any)[p || "before_faq"] || "before the FAQ");

function Placement({ r, reload }: { r: any; reload: () => void }) {
  const p = r.new?.position;
  const [mode, setMode] = useState<string>(posMode(p)); const [text, setText] = useState<string>(p && typeof p === "object" ? p.after_heading : "");
  const [occ, setOcc] = useState<number>(p && typeof p === "object" ? p.occurrence || 1 : 1); const [heads, setHeads] = useState<string[]>([]);
  useEffect(() => {
    if (mode !== "after_heading" || heads.length) return;
    supabase.from("page_audits").select("raw").eq("site_id", r.site_id).eq("page", r.page).order("audited_at", { ascending: false }).limit(1)
      .then(({ data }) => setHeads(((data?.[0]?.raw?.headings as any[]) || []).map(h => h.text).filter(Boolean)));
  }, [mode, heads.length, r.site_id, r.page]);
  async function save() {
    if (mode === "after_heading" && !text.trim()) { alert("Pick or type the heading first."); return; }
    const position = mode === "after_heading" ? { after_heading: text.trim(), ...(occ > 1 ? { occurrence: occ } : {}) } : mode;
    if (JSON.stringify(position) === JSON.stringify(p ?? "before_faq")) return;
    const { error } = await supabase.from("proposals").update({ new: { ...r.new, position }, reviewed_by: null, reviewed_at: null }).eq("id", r.id).eq("status", "pending");
    if (error) alert("Could not save the placement: " + error.message + (error.message.includes("policy") ? "\n\nRun schema_v19.sql in Supabase first." : "")); else reload();
  }
  return (<div className="small" style={{ margin: "6px 0" }}>
    <span className="muted">Place it: </span>
    <select value={mode} onChange={e => setMode(e.target.value)}>
      <option value="before_faq">Before the FAQ</option><option value="after_faq">After the FAQ</option><option value="end">End of the page</option><option value="after_heading">After a heading…</option></select>
    {mode === "after_heading" && <>{" "}<input list={`h-${r.id}`} value={text} onChange={e => setText(e.target.value)} placeholder="Heading text" style={{ minWidth: 220 }} />
      <datalist id={`h-${r.id}`}>{heads.map((h, i) => <option key={i} value={h} />)}</datalist>{" "}
      <span className="muted">same heading appears</span> <input type="number" min={1} max={20} value={occ} onChange={e => setOcc(Math.max(1, Number(e.target.value) || 1))} style={{ width: 52 }} /><span className="muted"> time(s); use #</span></>}
    {" "}<button onClick={save}>Save placement</button>
    <div className="muted">Now: {posLabel(p)}. The agent checks that the heading is on the live page before it adds the section.</div></div>);
}

const TABS = ["pending", "approved", "applied", "failed", "rejected", "rolled_back", "all"];
export default function Proposals() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [tab, setTab] = useState("pending");
  const cur = (): any => sites.find(x => x.id === site);
  const [rows, setRows] = useState<any[]>([]); const [busy, setBusy] = useState(0); const [msg, setMsg] = useState("");

  useEffect(() => { supabase.from("sites").select("*").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    let q = supabase.from("proposals").select("*").eq("site_id", site).order("created_at", { ascending: false }).limit(200);
    if (tab !== "all") q = q.eq("status", tab);
    const { data } = await q; setRows(data || []);
  }, [site, tab]);
  useEffect(() => { load(); }, [load]);

  async function decide(id: number, status: string, from: string) {
    if (status === "rollback_requested" && !confirm("Undo this change on the site? The agent will do it on its next run (or press Run now).")) return;
    setBusy(id);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("proposals").update({ status, decided_at: new Date().toISOString(), decided_by: u.user?.email }).eq("id", id).eq("status", from);
    setBusy(0); if (error) alert(error.message); else load();
  }
  async function review(r: any) {
    const who = cur()?.reviewer_name || "the reviewer";
    if (!confirm(`Confirm that ${who} has read this section and it is medically correct.`)) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("proposals").update({ reviewed_by: cur()?.reviewer_name || u.user?.email, reviewed_at: new Date().toISOString() }).eq("id", r.id);
    if (error) { alert("Could not save the review: " + error.message + (error.message.includes("reviewed") ? "\n\nRun schema_v10.sql in Supabase first." : "")); return; }
    load();
  }
  async function run() { setMsg("Starting…"); const r = await runAgent("daily"); setMsg(r.message); }
  // On a site with a reviewer: new sections, alt text and on-page title/meta need "Mark as reviewed" before Approve.
  const gated = (r: any) => !!cur()?.reviewer_required && !r.reviewed_at && (r.kind === "content_add" || r.kind === "alt_text" || (r.kind === "title_meta" && String(r.source || "").startsWith("onpage")));

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Proposals</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} />
      <button onClick={run}>Run now</button></div>
    {msg && <p className="muted small">{msg}</p>}
    <div className="row tabs">{TABS.map(t => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t.replace("_", " ")}</button>)}</div>
    <div className="card tw"><table><thead><tr><th>Page</th><th>Change</th><th>Status</th><th></th></tr></thead><tbody>
      {rows.map(r => (<tr key={r.id}>
        <td className="small" style={{ minWidth: 180 }}><a href={r.page} target="_blank" rel="noreferrer">{r.page.replace(/^https?:\/\/[^/]+/, "") || "/"}</a><div className="muted">#{r.id} · {new Date(r.created_at).toLocaleDateString()}</div></td>
        <td className="small" style={{ minWidth: 320 }}>
          <div className="muted">{({ title_meta: "Title + meta", schema: "Schema", internal_link: "Internal link", content_add: "New section", alt_text: "Image alt text" } as any)[r.kind] || r.kind}{r.source ? " · " + (r.source === "onpage" ? "old-pages batch" : r.source.replace("rank:", "keyword: ")) : ""}</div>
          {r.new?.review && <div className="small" style={{ color: "#d29922" }}>{r.new.review}: medical site, a doctor must check this before it goes live.</div>}
          {r.kind === "title_meta" && <><div className="old">{r.old?.title}</div><div className="new">{r.new?.title} <span className="muted">({r.new?.title?.length})</span></div>
            <div className="old" style={{ marginTop: 6 }}>{r.old?.meta}</div><div>{r.new?.meta} <span className="muted">({r.new?.meta?.length})</span></div></>}
          {r.kind === "schema" && <details open><summary>{r.new?.type}</summary><pre className="small" style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" }}>{JSON.stringify(r.new?.json_ld, null, 2)}</pre></details>}
          {r.kind === "internal_link" && <div>Link <b>“{r.new?.anchor}”</b> → <a href={r.new?.url} target="_blank" rel="noreferrer">{r.new?.url}</a><div className="muted">{r.new?.placement}</div></div>}
          {r.kind === "content_add" && <details open><summary>{r.new?.heading} <span className="muted">(grade {r.new?.grade})</span></summary><div className="new" dangerouslySetInnerHTML={{ __html: r.new?.html || "" }} /></details>}
          {r.kind === "content_add" && (r.status === "pending" ? <Placement r={r} reload={load} /> : <div className="muted small">Placed {posLabel(r.new?.position)}</div>)}
          {r.kind === "alt_text" && <details open><summary>{(r.new?.images || []).length} images</summary><table className="small"><tbody>
            {(r.new?.images || []).map((i: any, n: number) => <tr key={n}><td className="muted" style={{ maxWidth: 220, wordBreak: "break-all" }}>{String(i.src).split("/").pop()}{i.section ? <div>under “{i.section}”</div> : null}</td><td className="new">{i.alt}</td></tr>)}</tbody></table>
            <div className="muted">{r.new?.basis}</div></details>}
          {(r.kind === "content_add" || r.kind === "alt_text" || r.kind === "title_meta") && r.reviewed_by && <div className="muted small">Reviewed by {r.reviewed_by}</div>}
          {r.status === "failed" && r.reason && <div className="small" style={{ color: "#f85149" }}>{r.reason}</div>}
          {r.reason && <details><summary className="muted">Why</summary><div className="muted">{r.reason}</div></details>}</td>
        <td><span className={`badge b-${r.status}`}>{r.status.replace("_", " ")}</span></td>
        <td style={{ whiteSpace: "nowrap" }}>
          {r.status === "pending" && <>{gated(r) && <><button onClick={() => review(r)}>Mark as reviewed</button>{" "}</>}
            <button className="ok" disabled={busy === r.id || gated(r)} onClick={() => decide(r.id, "approved", "pending")}>Approve</button>{" "}
            <button className="bad" disabled={busy === r.id} onClick={() => decide(r.id, "rejected", "pending")}>Reject</button></>}
          {r.status === "applied" && <button disabled={busy === r.id || !r.backup_id} onClick={() => decide(r.id, "rollback_requested", "applied")}>Rollback</button>}</td></tr>))}
      {!rows.length && <tr><td colSpan={4} className="muted">Nothing here.</td></tr>}</tbody></table></div>
    <p className="muted small">Approve → the agent applies it on its next run (daily 9:00 IST, or press Run now). Even in dry-run mode, approved proposals are applied. After applying, the agent checks that the change really shows on the live page, and removes it again if not. On medical sites, new sections, image alt text and on-page title/meta fixes need “Mark as reviewed” first. Changing a section's placement clears the review, so it is checked again. Rollback undoes any change.</p>
  </Shell>);
}
