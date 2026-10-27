"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SiteSelect from "@/components/SiteSelect";
import BrainItems from "@/components/BrainItems";
import { supabase } from "@/lib/supabase";

const PROFILES = ["general", "medical", "finance", "legal", "ecommerce", "local_service"];
const KINDS = ["fact", "reference", "content", "voice", "faq", "logo", "link"];
const area: React.CSSProperties = { font: "inherit", color: "inherit", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", width: "100%", minHeight: 80 };

export default function SiteBrain() {
  const [sites, setSites] = useState<any[]>([]); const [site, setSite] = useState(""); const [f, setF] = useState<any>({}); const [msg, setMsg] = useState("");
  useEffect(() => { supabase.from("sites").select("*").order("id").then(({ data }) => { setSites(data || []); if (data?.length) setSite(data[0].id); }); }, []);
  useEffect(() => { const s = sites.find(x => x.id === site); if (s) setF({ niche: s.niche || "", profile: s.profile || "general", brand_voice: s.brand_voice || "", banned: (s.banned_terms || []).join(", "), reviewer_required: !!s.reviewer_required }); }, [site, sites]);

  async function save() {
    const banned_terms = f.banned.split(",").map((x: string) => x.trim()).filter(Boolean);
    const { error } = await supabase.from("sites").update({ niche: f.niche, profile: f.profile, brand_voice: f.brand_voice, banned_terms, reviewer_required: f.reviewer_required }).eq("id", site);
    setMsg(error ? error.message : "Saved ✓"); setTimeout(() => setMsg(""), 3000);
  }
  return (<Shell>
    <div className="row"><h1 style={{ margin: 0 }}>Site Brain</h1><span className="sp" /><SiteSelect sites={sites} value={site} onChange={setSite} /></div>
    <p className="muted small">Everything the agent may use for this site: facts, references, old content, voice, logo. The agent writes only from this.</p>
    <div className="card" style={{ marginBottom: 14 }}><h2>Site profile</h2>
      <div className="grid g2">
        <div className="grid">
          <input placeholder="Niche (e.g. plastic surgery clinic, SaaS, law firm)" value={f.niche || ""} onChange={e => setF({ ...f, niche: e.target.value })} />
          <select value={f.profile || "general"} onChange={e => setF({ ...f, profile: e.target.value })}>{PROFILES.map(p => <option key={p} value={p}>{p.replace("_", " ")} profile</option>)}</select>
          <input placeholder="Never use these words (comma separated)" value={f.banned || ""} onChange={e => setF({ ...f, banned: e.target.value })} />
          <label className="small"><input type="checkbox" checked={!!f.reviewer_required} onChange={e => setF({ ...f, reviewer_required: e.target.checked })} /> A reviewer must approve every post before it is published</label>
        </div>
        <textarea style={area} placeholder="Brand voice: how should the writing sound? Who is the reader?" value={f.brand_voice || ""} onChange={e => setF({ ...f, brand_voice: e.target.value })} />
      </div>
      <div className="row" style={{ marginTop: 10, marginBottom: 0 }}><button className="pri" onClick={save}>Save profile</button><span className="muted small">{msg}</span></div></div>
    {site && <BrainItems key={site} siteId={site} kinds={KINDS} />}
  </Shell>);
}
