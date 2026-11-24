// Builds a small, valid multi-page PDF in memory for the fake backend (dev, Playwright).
export function samplePdf(title: string, pages: string[][]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) - 0;
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} /MediaBox [0 0 612 792] >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((lines, i) => {
    const body = [
      "BT /F1 18 Tf 72 720 Td",
      `(${esc(i === 0 ? title : `${title} (page ${i + 1})`)}) Tj`,
      "/F1 11 Tf 0 -32 Td 15 TL",
      ...lines.map((l) => `(${esc(l)}) '`),
      "ET",
    ].join("\n");
    add(
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
