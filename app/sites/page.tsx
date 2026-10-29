"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";

const slug = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").split(".")[0].replace(/[^a-z0-9]/g, "").slice(0, 20);

function FtpEdit({ s, reload }: { s: any; reload: () => void }) {
  const [v, setV] = useState({ ftp_protocol: s.ftp_protocol || "ftp", ftp_root: s.ftp_root || "public_html", blog_path: s.blog_path || "blog", template_url: s.template_url || "" });
  return (<div className="small" style={{ marginBottom: 6 }}>
    <select value={v.ftp_protocol} onChange={e => setV({ ...v, ftp_protocol: e.target.value })}><option value="ftp">FTP</option><option value="ftps">FTPS</option><option value="sftp">SFTP</option></select>{" "}
    <input style={{ width: 110 }} value={v.ftp_root} onChange={e => setV({ ...v, ftp_root: e.target.value })} title="web-root folder" />{" "}
    <input style={{ width: 70 }} value={v.blog_path} onChange={e => setV({ ...v, blog_path: e.target.value })} title="blog folder" />{" "}
    <input style={{ width: 170 }} placeholder="template page URL" value={v.template_url} onChange={e => setV({ ...v, template_url: e.target.value })} />{" "}
    <button onClick={async () => { const { error } = await supabase.from("sites").update({ ...v, template_url: v.template_url.trim() || null }).eq("id", s.id); if (error) alert(error.message); else { reload(); alert("Saved"); } }}>Save FTP</button></div>);
}

export default function Sites() {
  const [list, setList] = useState<any[]>([]); const [msg, setMsg] = useState("");
  const [domain, setDomain] = useState(""); const [type, setType] = useState("wordpress"); const [gsc, setGsc] = useState(""); const [niche, setNiche] = useState("medical");
  const [reviewer, setReviewer] = useState(""); const [ppd, setPpd] = useState(1); const [auto, setAuto] = useState(true); const [proto, setProto] = useState("ftp"); const [root, setRoot] = useState("public_html"); const [blog, setBlog] = useState("blog"); const [tpl, setTpl] = useState(""); const [done, setDone] = useState<any>(null);
  const load = useCallback(async () => { const { data } = await supabase.from("sites").select("*").order("id"); setList(data || []); }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d.includes(".")) return setMsg("Enter the domain, e.g. drashishkhareplasticsurgeon.com");
    const id = slug(d); if (!id) return setMsg("Could not make an id from this domain.");
    if (list.some(s => s.id === id)) return setMsg("A site with id “" + id + "” already exists.");
    const base = "https://" + d; const prefix = id.toUpperCase();
    const row: any = { id, domain: d, type, mode: "dry-run", daily_page_limit: 1, gsc_property: (gsc.trim() || base + "/"), wp_base: base, secrets_prefix: prefix, niche, profile: niche, active: true, posts_per_day: ppd, autopilot: auto };
    if (type === "static") Object.assign(row, { ftp_protocol: proto, ftp_root: root.trim() || "public_html", blog_path: blog.trim() || "blog", template_url: tpl.trim() || null });
    if (niche === "medical") row.banned_terms = ["best plastic surgeon", "best doctor", "guaranteed results", "100% safe", "painless", "no risk", "permanent results"];
    if (reviewer.trim()) { row.reviewer_required = true; row.reviewer_name = reviewer.trim(); }
    const { error } = await supabase.from("sites").insert(row);
    if (error) return setMsg(error.message);
    setDone({ id, d, type, prefix, gsc: row.gsc_property }); setDomain(""); setGsc(""); setMsg(""); load();
  }
  async function setActive(s: any, active: boolean) {
    if (!active && !confirm("Switch off " + s.domain + "? The agent stops working on it. Nothing is deleted.")) return;
    const { error } = await supabase.from("sites").update({ active }).eq("id", s.id); if (error) alert(error.message); else load();
  }

  return (<Shell>
    <h1>Sites</h1>
    <p className="muted small">Every site the agent works on. Add a new one here. No code or file edits needed.</p>
    {msg && <p className="small" style={{ color: "#f85149" }}>{msg}</p>}
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <b>Add a site</b>
      <input placeholder="Domain, e.g. drashishkhareplasticsurgeon.com" value={domain} onChange={e => setDomain(e.target.value)} />
      <div className="row" style={{ marginBottom: 0 }}>
        <select value={type} onChange={e => setType(e.target.value)}><option value="wordpress">WordPress</option><option value="static">Plain HTML site</option></select>
        <select value={niche} onChange={e => setNiche(e.target.value)}><option value="medical">Medical / clinic</option><option value="general">Other business</option></select>
        <input style={{ flex: 1, minWidth: 220 }} placeholder="Medical reviewer name (optional), e.g. Dr. Ashish Khare" value={reviewer} onChange={e => setReviewer(e.target.value)} />
      </div>
      <div className="row" style={{ marginBottom: 0 }}>
        <label className="small">Posts per day <select value={ppd} onChange={e => setPpd(+e.target.value)}>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label className="small"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Autopilot: agent picks topics, writes and publishes daily{niche === "medical" || reviewer.trim() ? " (medical: reviewer must still approve each post)" : ""}</label>
      </div>
      {type === "static" && <div className="row" style={{ marginBottom: 0 }}>
        <select value={proto} onChange={e => setProto(e.target.value)}><option value="ftp">FTP</option><option value="ftps">FTPS (FTP over TLS)</option><option value="sftp">SFTP</option></select>
        <input placeholder="Web-root folder (public_html)" value={root} onChange={e => setRoot(e.target.value)} />
        <input placeholder="Blog folder (blog)" value={blog} onChange={e => setBlog(e.target.value)} />
        <input style={{ flex: 1, minWidth: 220 }} placeholder="Template page URL for new posts (optional)" value={tpl} onChange={e => setTpl(e.target.value)} />
      </div>}
      <input placeholder="Search Console property (leave empty to use https://domain/)" value={gsc} onChange={e => setGsc(e.target.value)} />
      <div><button className="ok" onClick={add}>Add site</button></div>
    </div>
    {done && <div className="card small" style={{ borderColor: "#3fb950" }}><b>{done.d} added. Two things left (they need your login, so they cannot be done from here):</b>
      <ol>
        <li>Search Console: open the property <code>{done.gsc}</code> → Settings → Users and permissions → Add user → <code>seo-agent@seo-agent-512716.iam.gserviceaccount.com</code> (Restricted).</li>
        {done.type === "wordpress" ? <li>WordPress: install the SEO Agent Bridge plugin, then add two GitHub secrets in the seo-Agent repo: <code>{done.prefix}_WP_USER</code> and <code>{done.prefix}_WP_APP_PASSWORD</code> (an Application Password).</li>
          : <li>Plain HTML site: add three GitHub secrets in the seo-Agent repo: <code>{done.prefix}_FTP_HOST</code>, <code>{done.prefix}_FTP_USER</code>, <code>{done.prefix}_FTP_PASSWORD</code>. Use a dedicated FTP user limited to this site's folder if your host allows it. For blog posts, the site needs a sitemap.xml and, in the blog index page, a comment <code>&lt;!--SAB-POSTS--&gt;</code> where the list should start.</li>}
      </ol>
      Then go to Overview and run the agent. The new site appears there.</div>}
    <div className="card tw"><table><thead><tr><th>Site</th><th>Type</th><th>Search Console</th><th>Mode</th><th>Daily posts</th><th></th></tr></thead><tbody>
      {list.map(s => (<tr key={s.id} style={{ opacity: s.active === false ? .5 : 1 }}>
        <td className="small"><b>{s.domain}</b><div className="muted">id: {s.id}</div></td><td className="small">{s.type === "static" ? "HTML" : "WordPress"}</td><td className="small">{s.gsc_property || "–"}</td>
        <td className="small">{s.active === false ? "off" : s.mode}</td>
        <td className="small">{s.type === "static" ? <FtpEdit s={s} reload={load} /> : null}
        {<><select value={s.posts_per_day ?? 1} onChange={async e => { const { error } = await supabase.from("sites").update({ posts_per_day: +e.target.value }).eq("id", s.id); if (error) alert(error.message); else load(); }}>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}/day</option>)}</select>
          <label style={{ marginLeft: 6 }}><input type="checkbox" checked={!!s.autopilot} onChange={async e => { const { error } = await supabase.from("sites").update({ autopilot: e.target.checked }).eq("id", s.id); if (error) alert(error.message); else load(); }} /> autopilot</label></>}</td>
        <td>{s.active === false ? <button onClick={() => setActive(s, true)}>Switch on</button> : <button onClick={() => setActive(s, false)}>Switch off</button>}</td></tr>))}
      {!list.length && <tr><td colSpan={6} className="muted">No sites.</td></tr>}</tbody></table></div>
  </Shell>);
}
