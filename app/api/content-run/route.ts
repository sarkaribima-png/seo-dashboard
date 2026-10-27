import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { site, command } = await req.json();
  if (command && !["write", "publish"].includes(command)) return NextResponse.json({ error: "bad command" }, { status: 400 });
  const gh = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO;
  if (!gh || !repo) return NextResponse.json({ error: "Not configured (GITHUB_TOKEN / GITHUB_REPO)." }, { status: 501 });
  const wf = command ? "content-post.yml" : "content.yml";
  const inputs: Record<string, string> = { site: String(site || "kalosa") };
  if (command) inputs.command = command;
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/dispatches`, {
    method: "POST", headers: { Authorization: `Bearer ${gh}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "main", inputs }) });
  if (r.status === 204) return NextResponse.json({ message: "Started. Refresh this page in 2-5 minutes." });
  return NextResponse.json({ error: "GitHub refused: " + r.status }, { status: 502 });
}
