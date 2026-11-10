"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { runContent, supabase } from "@/lib/supabase";

const TABS = ["proposed", "approved", "applied", "verified", "failed", "rolled_back", "rejected", "manual", "all"];
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
const TYPE: Record<string, string> = { title_meta: "Title + meta", alt_text: "Image alt text", viewport_add: "Mobile viewport tag", canonical_set: "Canonical tag", noindex_remove: "Remove noindex", schema_repair: "Repair JSON-LD",
  mixed_https: "http -> https (own files)", robots_sitemap_line: "robots.txt Sitemap line", robots_unblock: "robots.txt: remove Disallow", manual: "Manual steps" };
const confClass = (c: string) => (c === "High" ? "" : c === "Medium" ? "muted" : "down");
const parse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

function Diff({ f }: { f: any }) {
  if (f.fix_type === "title_meta") {
    const b = parse(f.before) || {}, a = parse(f.after) || {};
    return (<>{a.title !== b.title && <><div className="old">{b.title || <i>(empty)</i>}</div><div className="new">{a.title} <span className="muted">({a.title?.length})</span></div></>}
      {a.meta !== b.meta && <><div className="old" style={{ marginTop: 6 }}>{b.meta || <i>(empty)</i>}</div><div className="new">{a.meta} <span className="muted">({a.meta?.length})</span></div></>}</>);
  }
  if (f.fix_type === "alt_text") return (<table className="small"><tbody>{(parse(f.after) || []).map((i: any, n: number) => <tr key={n}><td className="muted" style={{ wordBreak: "break-all" }}>{String(i.src).split("/").pop()}</td><td className="new">{i.alt}</td></tr>)}</tbody></table>);
  if (f.manual) return <div className="small" style={{ whiteSpace: "pre-wrap" }}><code>{String(f.after || "").replace(/\\n/g, "\n")}</code></div>;
  return (<>{f.before ? <pre className="old small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{f.before}</pre> : <div className="muted small">(nothing there now)</div>}
    <pre className="new small" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{f.after || "(removed)"}</pre></>);
}

export default function Fixer() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [tab, setTab] = useState("proposed");
  const [rows, setRows] = useState<any[]>([]); const [busy, setBusy] = useState(0); const [msg, setMsg] = useState("");
  const cur = (): any => sites.find(x => x.id === site);
  useEffect(() => { supabase.from("sites").select("*").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    const { data, error } = await supabase.from("tech_fixes").select("*").eq("site_id", site).order("created_at", { ascending: false }).limit(500);
    if (error) setMsg("Could not load: " + error.message + " (has schema_v23.sql been run?)");
    setRows(data || []);
  }, [site]);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => rows.filter(r => tab === "all" || (tab === "manual" ? r.manual : !r.manual && r.status === tab)), [rows, tab]);
  const count = (t: string) => rows.filter(r => (t === "manual" ? r.manual : t === "all" ? true : !r.manual && r.status === t)).length;
  const cost = rows.reduce((t: number, r: any) => t + Number(r.llm_cost_usd || 0), 0);
  // The reviewer gate stays: on a site with a reviewer, copy (title/meta, alt text) is approved on the Proposals page after "Mark as reviewed".
  const gated = (r: any) => !!cur()?.reviewer_required && (r.fix_type === "title_meta" || r.fix_type === "alt_text");

  // same pattern as the Proposals page: the approval is the proposals row; tech_fixes is updated too so this page shows it at once
  async function decide(r: any, status: "approved" | "rejected") {
    if (!r.proposal_id) return;
    setBusy(r.id); const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("proposals").update({ status, decided_at: new Date().toISOString(), decided_by: u.user?.email }).eq("id", r.proposal_id).eq("status", "pending");
    if (!error) await supabase.from("tech_fixes").update({ status }).eq("id", r.id).eq("status", "proposed");
    setBusy(0); if (error) alert(error.message); else load();
  }
  async function rollback(r: any) {
    if (!r.proposal_id || !confirm("Undo this fix on the site? The agent does it on its next run (or press Run now).")) return;
    setBusy(r.id);
    const { error } = await supabase.from("proposals").update({ status: "rollback_requested" }).eq("id", r.proposal_id).eq("status", "applied");
    setBusy(0); if (error) alert(error.message); else { setMsg("Rollback requested. It happens on the next agent run."); load(); }
  }
  async function approveSafe() {
    const todo = list.filter(r => r.status === "proposed" && !r.manual && r.risk === "SAFE" && r.proposal_id && !gated(r));
    if (!todo.length || !confirm(`Approve ${todo.length} SAFE fix(es)? RISKY fixes are not included.`)) return;
    for (const r of todo) await decide(r, "approved");
  }
  async function run() { setMsg("Starting…"); const r = await runContent("fixer", site); setMsg(r.message); }

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Technical fixer</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /><button onClick={run}>Run now</button></div>
    <p className="muted small">Exact fixes for the findings on the <Link href="/tech">Tech</Link> page. SAFE fixes are small and reversible; RISKY ones (noindex, canonical to another URL, robots.txt) always wait for you. Redirects, server settings and deletions are shown as manual steps only. After a fix is applied the agent opens the live URL again; the finding is closed only when the fix is really visible.
      {" "}Auto-approve SAFE fixes on this site: <b>{cur()?.tech_auto_safe && !cur()?.reviewer_required && cur()?.profile !== "medical" ? "on" : "off"}</b>{(cur()?.reviewer_required || cur()?.profile === "medical") && " (never on a medical site)"}.</p>
    {msg && <p className="small">{msg}</p>}
    <div className="grid g4" style={{ marginBottom: 14 }}>
      {["proposed", "applied", "verified", "failed"].map(s => <div key={s} className="card kpi"><div className="l">{s}</div><div className={"v " + (s === "failed" && count(s) ? "down" : "")}>{count(s)}</div></div>)}
      <div className="card kpi"><div className="l">Claude cost (shown fixes)</div><div className="v">${cost.toFixed(3)}</div></div></div>
    <div className="row tabs">{TABS.map(t => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t.replace("_", " ")} ({count(t)})</button>)}
      {tab === "proposed" && <><span className="sp" /><button className="ok" onClick={approveSafe}>Approve all SAFE</button></>}</div>
    <div className="card tw"><table><thead><tr><th>Page</th><th>Fix</th><th>Status</th><th></th></tr></thead><tbody>
      {list.map(r => (<tr key={r.id}>
        <td className="small" style={{ minWidth: 170 }}><a href={r.url} target="_blank" rel="noreferrer">{path(r.url)}</a><div className="muted">{r.code} · #{r.id} · {new Date(r.created_at).toLocaleDateString()}</div></td>
        <td className="small" style={{ minWidth: 340 }}>
          <div><b>{TYPE[r.fix_type] || r.fix_type}</b> <span className={"badge " + (r.risk === "RISKY" ? "down" : "")}>{r.risk}</span> <span className={"small " + confClass(r.confidence)}>{r.confidence} confidence</span>
            <span className="muted"> · {r.source === "llm" ? "Claude" : r.source === "rule" ? "rule" : "audit"}{r.llm_cost_usd ? ` · $${Number(r.llm_cost_usd).toFixed(4)}` : ""}</span></div>
          <Diff f={r} />
          <details><summary className="muted">Why / evidence</summary><div className="muted">{r.rationale}</div><div className="muted">Evidence: {r.evidence}</div></details>
          {r.reason && (r.status === "failed" || r.status === "rolled_back") && <div className="small" style={{ color: "#f85149" }}>{r.reason}</div>}
          {r.status === "applied" && <div className="muted small">Applied, waiting for the live check ({r.verify_tries || 0}/3 checks missed).</div>}</td>
        <td><span className={`badge b-${r.status}`}>{r.manual ? "manual" : r.status.replace("_", " ")}</span></td>
        <td style={{ whiteSpace: "nowrap" }}>
          {r.status === "proposed" && !r.manual && r.proposal_id && <>
            {gated(r) ? <Link href="/proposals">Review on Proposals</Link> : <button className="ok" disabled={busy === r.id} onClick={() => decide(r, "approved")}>Approve</button>}{" "}
            <button className="bad" disabled={busy === r.id} onClick={() => decide(r, "rejected")}>Reject</button></>}
          {r.status === "approved" && <span className="muted small">applies on the next run</span>}
          {(r.status === "applied" || r.status === "verified") && !r.manual && <button disabled={busy === r.id || !r.proposal_id} onClick={() => rollback(r)}>Rollback</button>}
          {r.manual && <Link href="/tech">Tech page</Link>}</td></tr>))}
      {!list.length && <tr><td colSpan={4} className="muted">Nothing here. Fixes appear after the "technical-fixer" workflow has run on open findings.</td></tr>}</tbody></table></div>
    <p className="muted small">Approve → the agent applies it on its next run (daily, or Run now), checks the live page, and only then marks the finding fixed. If the fix does not show on the live page it is removed again and the finding stays open. Medical sites: title/meta and alt text also need “Mark as reviewed” on the Proposals page.</p>
  </Shell>);
}
