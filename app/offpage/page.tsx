"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

const COLS = [["todo", "To do"], ["doing", "Doing"], ["done", "Done"]] as const;
const LABEL: Record<string, string> = { gbp_post: "Google Business post", review_request: "Review request", citation: "Citation / NAP", outreach: "Outreach", guest_post: "Guest post", pr: "PR" };
const BL_TYPES = ["editorial", "guest_post", "citation", "directory", "pr", "outreach", "other"];
const BL_STATUS = ["pending", "live", "lost", "rejected"];
const confClass = (c: string) => (c === "High" ? "up" : c === "Low" ? "down" : "");
const blank = { id: 0, source_url: "", target_url: "", anchor: "", type: "editorial", status: "live", date_found: new Date().toISOString().slice(0, 10) };
const okUrl = (u: string) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };

export default function Offpage() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [tasks, setTasks] = useState<any[]>([]); const [links, setLinks] = useState<any[]>([]);
  const [msg, setMsg] = useState(""); const [open, setOpen] = useState<number | null>(null); const [showSkipped, setShowSkipped] = useState(false); const [f, setF] = useState<any>(blank); const [email, setEmail] = useState("");
  const load = (s: string) => {
    supabase.from("offpage_tasks").select("*").eq("site_id", s).order("due", { ascending: true }).limit(500).then(({ data, error }) => { if (error) setMsg("Could not load tasks: " + error.message + " (has schema_v27.sql been run?)"); setTasks(data || []); });
    supabase.from("backlink_log").select("*").eq("site_id", s).order("date_found", { ascending: false }).limit(500).then(({ data }) => setLinks(data || []));
  };
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email || "")); supabase.from("sites").select("id,domain").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  useEffect(() => { if (site) { setF(blank); load(site); } }, [site]);

  const blocked = (t: any) => t.needs_reviewer && !t.reviewed_by;
  const by = useMemo(() => { const m: Record<string, any[]> = { todo: [], doing: [], done: [], skipped: [] }; tasks.forEach(t => (m[t.status] || (m[t.status] = [])).push(t)); return m; }, [tasks]);

  async function copy(t: any) {
    if (blocked(t)) return setMsg("Medical site: the reviewer must OK this text first. Press 'Mark reviewed' and enter the reviewer's name.");
    try { await navigator.clipboard.writeText(t.draft || ""); setMsg("Draft copied. Post / send it yourself; this page never sends anything."); } catch { setMsg("Copy not allowed by the browser: open the draft and select the text by hand."); }
  }
  async function patch(t: any, d: any, ok: string) {
    const { error } = await supabase.from("offpage_tasks").update(d).eq("id", t.id); setMsg(error ? "Could not update: " + error.message : ok); load(site);
  }
  async function move(t: any, status: string) {
    if (status === "done" && blocked(t)) return setMsg("Cannot mark done: medical site, reviewer name not recorded yet.");
    patch(t, { status, done_at: status === "done" ? new Date().toISOString() : null }, `Moved to ${status}.`);
  }
  async function review(t: any) {
    const who = window.prompt("Reviewer name (for example the doctor who read this text):", t.reviewed_by || ""); if (!who?.trim()) return;
    patch(t, { reviewed_by: who.trim(), reviewed_at: new Date().toISOString() }, "Reviewer recorded.");
  }
  async function note(t: any) { const n = window.prompt("Notes (what you did, link to the post, reply received):", t.notes || ""); if (n !== null) patch(t, { notes: n }, "Notes saved."); }

  async function saveLink(e: React.FormEvent) {
    e.preventDefault();
    if (!okUrl(f.source_url) || !okUrl(f.target_url)) return setMsg("Source URL and target URL must start with http:// or https://");
    const row = { site_id: site, source_url: f.source_url.trim(), target_url: f.target_url.trim(), anchor: f.anchor.trim() || null, type: f.type, status: f.status, date_found: f.date_found };
    const { error } = f.id ? await supabase.from("backlink_log").update(row).eq("id", f.id) : await supabase.from("backlink_log").insert({ ...row, added_by: email || "dashboard" });
    setMsg(error ? "Could not save: " + error.message : f.id ? "Backlink updated." : "Backlink added."); if (!error) { setF(blank); load(site); }
  }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const card = (t: any) => (<div key={t.id} className="card" style={{ marginBottom: 10 }}>
    <div className="row" style={{ marginBottom: 6 }}><span className="badge">{LABEL[t.type] || t.type}</span><span className={"badge " + confClass(t.confidence)}>{t.confidence || "?"} confidence</span>
      {t.needs_reviewer && <span className={"badge " + (t.reviewed_by ? "up" : "down")}>{t.reviewed_by ? `Reviewed: ${t.reviewed_by}` : "Reviewer needed"}</span>}<span className="sp" /><span className="muted small">due {t.due || "-"}</span></div>
    <b>{t.title}</b>
    <div className="small muted">Target: {t.target || "-"}</div>
    <div className="small muted">Evidence: {t.evidence || "-"}</div>
    {t.notes && <div className="small" style={{ marginTop: 4 }}>{t.notes}</div>}
    {open === t.id && <pre className="small" style={{ whiteSpace: "pre-wrap", background: "var(--bg)", padding: 10, borderRadius: 8, marginTop: 8 }}>{t.draft || "No draft."}</pre>}
    <div className="row" style={{ marginTop: 8, marginBottom: 0 }}>
      <button onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? "Hide draft" : "Show draft"}</button>
      <button className="pri" disabled={!t.draft} onClick={() => copy(t)}>Copy draft</button>
      {t.needs_reviewer && <button onClick={() => review(t)}>{t.reviewed_by ? "Change reviewer" : "Mark reviewed"}</button>}
      <button onClick={() => note(t)}>Notes</button>
      {t.status !== "todo" && <button onClick={() => move(t, "todo")}>To do</button>}
      {t.status !== "doing" && t.status !== "done" && <button onClick={() => move(t, "doing")}>Start</button>}
      {t.status !== "done" && <button className="ok" onClick={() => move(t, "done")}>Done</button>}
      {t.status !== "skipped" && t.status !== "done" && <button onClick={() => move(t, "skipped")}>Skip</button>}
    </div></div>);

  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Off-page &amp; Local SEO</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <p className="muted small">The agent only plans and writes drafts (max 5 new tasks per site per week, every Monday: workflow "offpage"). A person posts, emails or asks. No paid links, no guarantees, no incentivised or scripted reviews. On medical sites a reviewer must OK each text before it is posted. Missing facts are shown as DATA NOT AVAILABLE.</p>
    {msg && <p className="small">{msg}</p>}
    <div className="grid g2" style={{ alignItems: "start" }}>
      {COLS.map(([k, name]) => <div key={k}><h2>{name} <span className="muted small">({by[k].length})</span></h2>{by[k].map(card)}{!by[k].length && <p className="muted small">Nothing here.</p>}</div>)}</div>
    <p className="small"><a href="#" onClick={e => { e.preventDefault(); setShowSkipped(!showSkipped); }}>{showSkipped ? "Hide" : "Show"} skipped ({by.skipped.length})</a></p>
    {showSkipped && by.skipped.map(card)}

    <h2 style={{ marginTop: 24 }}>Backlink log</h2>
    <form className="card row" onSubmit={saveLink} style={{ alignItems: "flex-end" }}>
      <label className="small">Source URL (page that links to us)<br /><input style={{ width: 260 }} value={f.source_url} onChange={set("source_url")} placeholder="https://..." /></label>
      <label className="small">Target URL (our page)<br /><input style={{ width: 240 }} value={f.target_url} onChange={set("target_url")} placeholder="https://..." /></label>
      <label className="small">Anchor text<br /><input value={f.anchor} onChange={set("anchor")} /></label>
      <label className="small">Type<br /><select value={f.type} onChange={set("type")}>{BL_TYPES.map(x => <option key={x}>{x}</option>)}</select></label>
      <label className="small">Status<br /><select value={f.status} onChange={set("status")}>{BL_STATUS.map(x => <option key={x}>{x}</option>)}</select></label>
      <label className="small">Date found<br /><input type="date" value={f.date_found} onChange={set("date_found")} /></label>
      <button className="pri" type="submit">{f.id ? "Save changes" : "Add backlink"}</button>{f.id ? <button type="button" onClick={() => setF(blank)}>Cancel</button> : null}</form>
    <div className="card tw"><table><thead><tr><th>Found</th><th>Source</th><th>Target</th><th>Anchor</th><th>Type</th><th>Status</th><th>Added by</th><th></th></tr></thead><tbody>
      {links.map(l => <tr key={l.id}><td className="small">{l.date_found}</td><td className="small"><a href={l.source_url} target="_blank" rel="noreferrer">{l.source_url.replace(/^https?:\/\//, "").slice(0, 50)}</a></td>
        <td className="small">{l.target_url.replace(/^https?:\/\/[^/]+/, "") || "/"}</td><td className="small">{l.anchor || "-"}</td><td>{l.type}</td><td>{l.status}</td><td className="small">{l.added_by}</td>
        <td><button onClick={() => setF({ ...l, anchor: l.anchor || "" })}>Edit</button></td></tr>)}
      {!links.length && <tr><td colSpan={8} className="muted">No backlinks logged yet. Add only links you have seen yourself; the agent does not discover backlinks (no backlink data source is connected: DATA NOT AVAILABLE).</td></tr>}</tbody></table></div>
  </Shell>);
}
