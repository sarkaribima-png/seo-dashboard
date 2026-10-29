"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { runAgent, supabase } from "@/lib/supabase";

const TABS = ["pending", "approved", "applied", "failed", "rejected", "rolled_back", "all"];
export default function Proposals() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState<any[]>([]); const [busy, setBusy] = useState(0); const [msg, setMsg] = useState("");

  useEffect(() => { supabase.from("sites").select("id,domain").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    let q = supabase.from("proposals").select("*").eq("site_id", site).order("created_at", { ascending: false }).limit(200);
    if (tab !== "all") q = q.eq("status", tab);
    const { data } = await q; setRows(data || []);
  }, [site, tab]);
  useEffect(() => { load(); }, [load]);

  async function decide(id: number, status: string, from: string) {
    if (status === "rollback_requested" && !confirm("Restore the old title/meta on the site? The agent will do it on its next run (or press Run now).")) return;
    setBusy(id);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("proposals").update({ status, decided_at: new Date().toISOString(), decided_by: u.user?.email }).eq("id", id).eq("status", from);
    setBusy(0); if (error) alert(error.message); else load();
  }
  async function run() { setMsg("Starting…"); const r = await runAgent("daily"); setMsg(r.message); }

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Proposals</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} />
      <button onClick={run}>Run now</button></div>
    {msg && <p className="muted small">{msg}</p>}
    <div className="row tabs">{TABS.map(t => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t.replace("_", " ")}</button>)}</div>
    <div className="card tw"><table><thead><tr><th>Page</th><th>Change</th><th>Status</th><th></th></tr></thead><tbody>
      {rows.map(r => (<tr key={r.id}>
        <td className="small" style={{ minWidth: 180 }}><a href={r.page} target="_blank" rel="noreferrer">{r.page.replace(/^https?:\/\/[^/]+/, "") || "/"}</a><div className="muted">#{r.id} · {new Date(r.created_at).toLocaleDateString()}</div></td>
        <td className="small" style={{ minWidth: 320 }}>
          <div className="muted">{({ title_meta: "Title + meta", schema: "Schema", internal_link: "Internal link", content_add: "New section" } as any)[r.kind] || r.kind}{r.source ? " · " + r.source.replace("rank:", "keyword: ") : ""}</div>
          {r.kind === "title_meta" && <><div className="old">{r.old?.title}</div><div className="new">{r.new?.title} <span className="muted">({r.new?.title?.length})</span></div>
            <div className="old" style={{ marginTop: 6 }}>{r.old?.meta}</div><div>{r.new?.meta} <span className="muted">({r.new?.meta?.length})</span></div></>}
          {r.kind === "schema" && <details open><summary>{r.new?.type}</summary><pre className="small" style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" }}>{JSON.stringify(r.new?.json_ld, null, 2)}</pre></details>}
          {r.kind === "internal_link" && <div>Link <b>“{r.new?.anchor}”</b> → <a href={r.new?.url} target="_blank" rel="noreferrer">{r.new?.url}</a><div className="muted">{r.new?.placement}</div></div>}
          {r.kind === "content_add" && <details open><summary>{r.new?.heading} <span className="muted">(grade {r.new?.grade})</span></summary><div className="new" dangerouslySetInnerHTML={{ __html: r.new?.html || "" }} /></details>}
          {r.kind !== "title_meta" && <div className="muted small">Applying this kind needs the next agent update (plugin v0.3). Approval is saved; nothing changes on the site until then.</div>}
          {r.reason && <details><summary className="muted">Why</summary><div className="muted">{r.reason}</div></details>}</td>
        <td><span className={`badge b-${r.status}`}>{r.status.replace("_", " ")}</span></td>
        <td style={{ whiteSpace: "nowrap" }}>
          {r.status === "pending" && <><button className="ok" disabled={busy === r.id} onClick={() => decide(r.id, "approved", "pending")}>Approve</button>{" "}
            <button className="bad" disabled={busy === r.id} onClick={() => decide(r.id, "rejected", "pending")}>Reject</button></>}
          {r.status === "applied" && <button disabled={busy === r.id || !r.backup_id} onClick={() => decide(r.id, "rollback_requested", "applied")}>Rollback</button>}</td></tr>))}
      {!rows.length && <tr><td colSpan={4} className="muted">Nothing here.</td></tr>}</tbody></table></div>
    <p className="muted small">Approve → the agent applies it on its next run (daily 9:00 IST, or press Run now). Even in dry-run mode, approved proposals are applied.</p>
  </Shell>);
}
