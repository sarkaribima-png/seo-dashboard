"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const path = usePathname();
  const [email, setEmail] = useState(""); const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login"); else { setEmail(data.session.user.email || ""); setReady(true); }
    });
  }, [router]);
  if (!ready) return <div className="center muted">Loading…</div>;
  const L = (href: string, t: string) => <Link href={href} className={path === href ? "on" : ""}>{t}</Link>;
  return (<>
    <div className="nav"><b>SEO Agent</b>{L("/", "Projects")}{L("/proposals", "Proposals")}{L("/audits", "Audits")}{L("/brain", "Site Brain")}{L("/seo-brain", "SEO Brain")}{L("/content", "Content")}{L("/posts", "Posts")}{L("/post-performance", "Post performance")}{L("/rank", "Rank a page")}{L("/tracking", "Rank tracking")}{L("/experiments", "Experiments")}{L("/watch", "Competitor watch")}{L("/sites", "Sites")}<span className="sp" />
      <span className="muted small">{email}</span>
      <button onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>Sign out</button></div>
    <div className="wrap">{children}</div></>);
}
