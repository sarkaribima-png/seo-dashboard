"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { runContent, supabase } from "@/lib/supabase";

const LIMITS = [10, 20, 40, 60];
export default function OnPage() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [limit, setLimit] = useState(20);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, number>>({}); const [finds, setFinds] = useState<any[]>([]); const [pages, setPages] = useState(0);
  useEffect(() => { supabase.from("sites").select("id,domain").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  const load = useCallback(async () => {
    if (!site) return;
    const [p, f, a] = await Promise.all([
      supabase.from("proposals").select("kind").eq("site_id", site).eq("status", "pending").eq("source", "onpage").limit(1000),
      supabase.from("onpage_findings").select("*").eq("site_id", site).eq("status", "open").order("created_at", { ascending: false }).limit(300),
      supabase.from("page_audits_latest").select("id", { count: "exact", head: true }).eq("site_id", site)]);
    const c: Record<string, number> = {}; (p.data || []).forEach((x: any) => { c[x.kind] = (c[x.kind] || 0) + 1; });
    setPending(c); setFinds(f.data || []); setPages(a.count || 0);
  }, [site]);
  useEffect(() => { load(); }, [load]);
  async function start() { setBusy(true); setMsg("Starting…"); const r = await runContent("onpage", site, { limit }); setMsg(r.message); setBusy(false); }
  async function mark(id: number, status: string) {
    const { error } = await supabase.from("onpage_findings").update({ status, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "open");
    if (error) alert(error.message + "\n\nRun schema_v19.sql in Supabase first."); else load();
  }
  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Old pages</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <p className="muted small">Finds weak titles, meta descriptions and image alt text on pages that already exist, and writes them as proposals. Nothing changes on the site until you approve on the <Link href="/proposals">Proposals</Link> page.
      Needs a recent audit ({pages} pages audited). Pages with the most Google impressions come first.</p>
    <div className="card row">
      <span>Make up to</span><select value={limit} onChange={e => setLimit(Number(e.target.value))}>{LIMITS.map(n => <option key={n} value={n}>{n}</option>)}</select><span>proposals</span>
      <button disabled={busy || !site} onClick={start}>Find fixes</button><span className="sp" />
      <span className="muted small">Waiting for your decision: {pending.title_meta || 0} title/meta, {pending.alt_text || 0} alt text</span></div>
    {msg && <p className="muted small">{msg} Refresh in a few minutes.</p>}
    <div className="card tw"><h2>H1 problems (fix in the page editor)</h2>
      <table><thead><tr><th>Page</th><th>Problem</th><th>What to do</th><th></th></tr></thead><tbody>
        {finds.map(f => (<tr key={f.id}><td className="small"><a href={f.page} target="_blank" rel="noreferrer">{f.page.replace(/^https?:\/\/[^/]+/, "") || "/"}</a></td>
          <td className="small">{f.issue.replace("_", " ")}{(f.found || []).length ? <div className="muted">{(f.found || []).join(" | ")}</div> : null}</td><td className="small">{f.detail}</td>
          <td style={{ whiteSpace: "nowrap" }}><button className="ok" onClick={() => mark(f.id, "done")}>Done</button>{" "}<button onClick={() => mark(f.id, "ignored")}>Ignore</button></td></tr>))}
        {!finds.length && <tr><td colSpan={4} className="muted">No open H1 findings.</td></tr>}</tbody></table></div>
    <p className="muted small">Heading checks read the live page. Image alt text is written from file names and nearby text, so check a few before approving.</p>
  </Shell>);
}
