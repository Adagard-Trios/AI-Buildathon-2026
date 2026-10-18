import type { ReactNode } from "react";

/**
 * The few markdown forms Gemini uses in answers: **bold**, `code`, "* " / "- " bullets and
 * paragraph breaks. Rendered as elements, never as HTML, so model output cannot inject markup.
 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-black/5 px-1 text-[0.9em]">{part.slice(1, -1)}</code>;
    return part;
  });
}

export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: { depth: number; text: string }[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={blocks.length} className="my-1.5 space-y-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2" style={{ paddingLeft: b.depth * 16 }}>
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-60" />
            <span>{inline(b.text)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of text.split("\n")) {
    const bullet = /^(\s*)[*-]\s+(.*)$/.exec(raw);
    if (bullet) {
      bullets.push({ depth: Math.min(2, Math.floor(bullet[1].length / 2)), text: bullet[2] });
      continue;
    }
    flush();
    if (raw.trim()) blocks.push(<p key={blocks.length} className="my-1">{inline(raw.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className="break-words">{blocks}</div>;
}
