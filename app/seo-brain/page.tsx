"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import BrainItems from "@/components/BrainItems";
import { supabase } from "@/lib/supabase";

const KINDS = ["update", "case_study", "note", "link"];
const APPLIES = ["all", "general", "medical", "finance", "legal", "ecommerce", "local_service"];
const area: React.CSSProperties = { font: "inherit", color: "inherit", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", width: "100%", minHeight: 70 };

export default function SeoBrain() {
  const [rules, setRules] = useState<any[]>([]); const [title, setTitle] = useState(""); const [rule, setRule] = useState(""); const [applies, setApplies] = useState("all");
  const load = useCallback(async () => { const { data } = await supabase.from("seo_rules").select("*").neq("status", "retired").order("created_at", { ascending: false }); setRules(data || []); }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!title.trim() || !rule.trim()) return;
    const { error } = await supabase.from("seo_rules").insert({ title: title.trim(), rule: rule.trim(), applies_to: applies, status: "proposed" });
    if (error) alert(error.message); else { setTitle(""); setRule(""); load(); }
  }
  async function set(id: number, status: string) { await supabase.from("seo_rules").update({ status, decided_at: new Date().toISOString() }).eq("id", id); load(); }

  return (<Shell>
    <h1>SEO Brain</h1>
    <p className="muted small">Shared by all sites. Add SEO updates and case studies; turn what you trust into <b>rules</b>. Only <b>active</b> rules are used by the agent.</p>
    <div className="card" style={{ marginBottom: 14 }}><h2>Rules</h2>
      <form onSubmit={add} className="grid g2" style={{ marginBottom: 12 }}>
        <div className="grid"><input placeholder="Rule title" value={title} onChange={e => setTitle(e.target.value)} required />
          <select value={applies} onChange={e => setApplies(e.target.value)}>{APPLIES.map(a => <option key={a} value={a}>applies to: {a.replace("_", " ")}</option>)}</select>
          <button className="pri">Add rule (as proposed)</button></div>
        <textarea style={area} placeholder="The rule in plain words, e.g. 'Put the main question in the first 100 words of every post.'" value={rule} onChange={e => setRule(e.target.value)} required />
      </form>
      <div className="tw"><table><thead><tr><th>Rule</th><th>Applies to</th><th>Status</th><th></th></tr></thead><tbody>
        {rules.map(r => (<tr key={r.id}><td className="small" style={{ minWidth: 260 }}><b>{r.title}</b><div className="muted">{r.rule}</div></td>
          <td className="small">{r.applies_to}</td><td><span className={`badge ${r.status === "active" ? "b-applied" : "b-pending"}`}>{r.status}</span></td>
          <td style={{ whiteSpace: "nowrap" }}>{r.status === "proposed" && <button className="ok" onClick={() => set(r.id, "active")}>Activate</button>}{" "}
            <button onClick={() => set(r.id, "retired")}>{r.status === "proposed" ? "Reject" : "Retire"}</button></td></tr>))}
        {!rules.length && <tr><td colSpan={4} className="muted">No rules yet.</td></tr>}</tbody></table></div></div>
    <BrainItems siteId={null} kinds={KINDS} />
  </Shell>);
}
