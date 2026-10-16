// Minimal markdown for meeting summaries: headings, bullets, checkboxes, bold, links. Renders as React text (no HTML injection).

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${key}-b${i++}`} className="text-ink">{m[1]}</strong>);
    // Links into Notion become plain text: Ella doesn't use Notion.
    else if (/notion\.(so|com)/i.test(m[3])) out.push(m[2]);
    else
      out.push(
        <a key={`${key}-a${i++}`} href={m[3]} target="_blank" rel="noreferrer" className="no-underline">
          {m[2]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { checked: boolean | null; text: string }[] = [];
  const flush = (k: number) => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul${k}`} className="m-0 flex flex-col gap-1.5 pl-5">
        {list.map((li, j) => (
          <li key={j} className={li.checked ? "text-ink-muted line-through" : ""}>
            {inline(li.text, `li${k}-${j}`)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  text.split("\n").forEach((raw, k) => {
    const line = raw.trim();
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const li = line.match(/^[-*]\s+(?:\[( |x)\]\s+)?(.*)$/i);
    if (li) {
      list.push({ checked: li[1] ? li[1].toLowerCase() === "x" : null, text: li[2] });
      return;
    }
    flush(k);
    if (!line) return;
    if (h)
      blocks.push(
        <h4 key={k} className="m-0 mt-2 text-sm font-semibold text-ink">
          {inline(h[1], `h${k}`)}
        </h4>,
      );
    else blocks.push(<p key={k} className="m-0">{inline(line, `p${k}`)}</p>);
  });
  flush(-1);
  return <div className="flex flex-col gap-2 text-[15px] leading-[23px] text-ink-soft">{blocks}</div>;
}
