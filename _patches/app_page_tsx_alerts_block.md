# Patch description for app/page.tsx (Projects home) - NOT applied, original file untouched

Goal: show a red "Needs attention" block per site card using the latest weekly report (no new calculations in the browser).

1. In the `Promise.all` inside the first `useEffect`, add a 7th query and a state `const [reps, setReps] = useState<any[]>([]);`:
   `supabase.from("reports").select("site_id,period,period_start,json").eq("period","week").order("period_start",{ascending:false}).limit(50)`
   then `setReps(rp.data || [])` next to the other setters. (If the table does not exist yet the result is an error with data null: `|| []` keeps the page working.)
2. In the `cards` useMemo, per site add:
   `const rep = reps.find(r => r.site_id === id); const al = (rep?.json?.alerts || []).filter((a:any) => a.severity !== "info");`
   and return `alerts: al, repDate: rep?.period_start, repConf: rep?.json?.confidence` (add `reps` to the dependency array).
3. In the card JSX, right after the header `<div className="row" ...>` block and before the `grid`, insert:
   ```tsx
   {c.alerts.length > 0 && <div style={{ borderLeft: "4px solid var(--bad)", paddingLeft: 10, marginBottom: 10 }}>
     <b>{c.alerts.length} alert</b> <span className="muted small">from the weekly report of {c.repDate} · confidence {c.repConf}</span>
     {c.alerts.slice(0, 3).map((a: any, i: number) => <div key={i} className="small">• {a.title}</div>)}
     <Link href="/reports" className="small">Open report →</Link></div>}
   ```
4. Optionally add `{L("/reports", "Reports")}` to the nav links in `components/Shell.tsx` (after "Experiments").
