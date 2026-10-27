// Reads Ahrefs CSV exports (UTF-16 or UTF-8, tab or comma separated) into rows of {header: value}.
export async function readCsv(file: File): Promise<Record<string, string>[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let text: string;
  if (buf[0] === 0xff && buf[1] === 0xfe) text = new TextDecoder("utf-16le").decode(buf.subarray(2));
  else if (buf[0] === 0xfe && buf[1] === 0xff) text = new TextDecoder("utf-16be").decode(buf.subarray(2));
  else text = new TextDecoder("utf-8").decode(buf).replace(/\u0000/g, "").replace(/\ufffd/g, "").replace(/^\ufeff/, "");
  text = text.replace(/^\ufeff/, "");
  if (text.includes('"""')) text = text.replace(/"""/g, '"');
  const first = text.split(/\r?\n/, 1)[0] || "";
  const delim = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : ",";
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, "")); rows.push(row); }
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}
export const num = (v: string | undefined) => { const n = parseFloat((v || "").replace(/,/g, "")); return isNaN(n) ? null : n; };
export const bool = (v: string | undefined) => (v || "").toLowerCase() === "true";
