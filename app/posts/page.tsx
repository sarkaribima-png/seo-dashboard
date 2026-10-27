"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import { supabase } from "@/lib/supabase";

const css = "<style>body{font:16px/1.7 system-ui,sans-serif;max-width:720px;margin:20px auto;padding:0 16px;color:#222}img{max-width:100%;height:auto;border-radius:8px}h2{margin-top:1.6em}</style>";

export default function Posts() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [posts, setPosts] = useState<any[]>([]);
  const [filter, setFilter] = useState("draft"); const [open, setOpen] = useState<number | null>(null); const [msg, setMsg] = useState(""); const [email, setEmail] = useState("");
  const cur = sites.find(s => s.id === site);

  useEffect(() => {
    supabase.from("sites").select("*").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); });
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email || ""));
  }, []);
  const load = useCallback(async () => {
    if (!site) return;
    const { data } = await supabase.from("content_posts").select("*").eq("site_id", site).order("created_at", { ascending: false }).limit(100);
    setPosts(data || []);
  }, [site]);
  useEffect(() => { load(); }, [load]);

  async function run(command: string) {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/content-run", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ site, command }) });
    const j = await r.json().catch(() => ({})); setMsg(j.message || j.error || "");
  }
  async function review(p: any) {
    const who = cur?.reviewer_name || "the reviewer";
    if (!confirm(`Confirm: ${who} has read this post and found it accurate.`)) return;
    await supabase.from("content_posts").update({ reviewed_by: cur?.reviewer_name || email, reviewed_email: email, reviewed_at: new Date().toISOString() }).eq("id", p.id); load();
  }
  async function approve(p: any) {
    if (cur?.reviewer_required && !p.reviewed_at) { alert("This site needs a reviewer. Click 'Mark as reviewed' first."); return; }
    await supabase.from("content_posts").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", p.id); load();
  }
  async function reject(p: any) { await supabase.from("content_posts").update({ status: "rejected" }).eq("id", p.id); load(); }
  async function unapprove(p: any) { await supabase.from("content_posts").update({ status: "draft", approved_at: null }).eq("id", p.id); load(); }

  const shown = posts.filter(p => filter === "all" || p.status === filter);
  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Posts</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <div className="row"><button onClick={() => run("write")}>Write drafts now</button><button onClick={() => run("publish")}>Publish approved now</button><span className="muted small">{msg}</span></div>
    <p className="muted small">Flow: draft → read it → Mark as reviewed{cur?.reviewer_name ? ` (${cur.reviewer_name})` : ""} → Approve → the agent publishes {cur?.posts_per_day || 1} post per day.</p>
    <div className="row tabs">{["draft", "approved", "published", "rejected", "all"].map(s => <button key={s} className={filter === s ? "on" : ""} onClick={() => setFilter(s)}>{s}</button>)}</div>
    {shown.map(p => (<div className="card" key={p.id} style={{ marginBottom: 12 }}>
      <div className="row" style={{ marginBottom: 6 }}><b>{p.title}</b><span className="sp" /><span className={`badge ${p.status === "published" || p.status === "approved" ? "b-applied" : "b-pending"}`}>{p.status}</span></div>
      <div className="small muted">{p.words} words (target {p.target_words || "–"}) · reading grade {p.grade} · {(p.images || []).length} images · {p.reviewed_at ? `reviewed by ${p.reviewed_by}, ${new Date(p.reviewed_at).toLocaleString()}` : "not reviewed"}</div>
      {!!(p.issues || []).length && <div className="small" style={{ color: "#e5a550", marginTop: 4 }}>Check: {(p.issues || []).join(" · ")}</div>}
      <div className="small muted" style={{ marginTop: 4 }}>Meta title: {p.meta_title}<br />Meta description: {p.meta_description}</div>
      <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
        <button onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Hide preview" : "Read post"}</button>
        {cur?.wp_base && p.wp_post_id && <a className="small" target="_blank" rel="noreferrer" href={`${cur.wp_base.replace(/\/$/, "")}/wp-admin/post.php?post=${p.wp_post_id}&action=edit`}>Edit in WordPress</a>}
        {p.publish_url && <a className="small" target="_blank" rel="noreferrer" href={p.publish_url}>View live</a>}
        <span className="sp" />
        {p.status === "draft" && <>{!p.reviewed_at && <button onClick={() => review(p)}>Mark as reviewed</button>}<button className="ok" onClick={() => approve(p)}>Approve to publish</button><button onClick={() => reject(p)}>Reject</button></>}
        {p.status === "approved" && <button onClick={() => unapprove(p)}>Take back</button>}
      </div>
      {open === p.id && <iframe sandbox="" srcDoc={css + `<h1>${p.title.replace(/</g, "&lt;")}</h1>` + p.html} style={{ width: "100%", height: 560, marginTop: 10, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />}
    </div>))}
    {!shown.length && <div className="card muted">Nothing here yet.</div>}
  </Shell>);
}
