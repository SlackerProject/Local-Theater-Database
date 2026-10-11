import type { ReactNode } from "react";

// The simple formatting used in update posts, written by the editor's
// toolbar buttons:
//   ## Heading   ### Smaller heading   **bold**   *italic*
//   [link text](https://...)   - list item   ![description](image address)
// Turned into React elements directly (never raw HTML), so nothing in a
// post can run code. Links and images must be https:// (or start with /).

function safeUrl(url: string) {
  return /^(https?:\/\/|\/)[^\s]*$/i.test(url) ? url : null;
}

function inline(text: string, key: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g);
  return parts.map((part, i) => {
    const k = `${key}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={k}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = safeUrl(link[2]);
      if (!href) return link[1];
      const external = /^https?:/i.test(href);
      return (
        <a key={k} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

export function renderPost(body: string): ReactNode[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      const k = `p${out.length}`;
      out.push(
        <p key={k}>
          {paragraph.flatMap((l, i) => (i ? [<br key={`${k}-br${i}`} />, ...inline(l, `${k}-${i}`)] : inline(l, `${k}-${i}`)))}
        </p>,
      );
      paragraph = [];
    }
    if (list.length) {
      const k = `ul${out.length}`;
      out.push(
        <ul key={k}>
          {list.map((l, i) => (
            <li key={`${k}-${i}`}>{inline(l, `${k}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const image = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (!line.trim()) {
      flush();
    } else if (line.startsWith("### ")) {
      flush();
      out.push(<h3 key={`h${out.length}`}>{inline(line.slice(4), `h${out.length}`)}</h3>);
    } else if (line.startsWith("## ")) {
      flush();
      out.push(<h2 key={`h${out.length}`}>{inline(line.slice(3), `h${out.length}`)}</h2>);
    } else if (/^[-*] /.test(line)) {
      if (paragraph.length) {
        const keep = list;
        list = [];
        flush();
        list = keep;
      }
      list.push(line.slice(2));
    } else if (image) {
      flush();
      const src = safeUrl(image[2]);
      if (src) {
        out.push(
          <figure key={`f${out.length}`}>
            <img src={src} alt={image[1]} loading="lazy" />
            {image[1] && <figcaption>{image[1]}</figcaption>}
          </figure>,
        );
      }
    } else {
      if (list.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return out;
}

// Styles for a post body (headings, lists, images, links)
export const POST_BODY =
  "flex flex-col gap-4 text-[17px] leading-relaxed [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-[3px] [&_figcaption]:mt-1.5 [&_figcaption]:text-sm [&_figcaption]:text-muted [&_figure]:m-0 [&_h2]:m-0 [&_h2]:mt-3 [&_h2]:text-[24px] [&_h2]:font-extrabold [&_h2]:tracking-[-0.01em] [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-[19px] [&_h3]:font-extrabold [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_li]:mb-1 [&_p]:m-0 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-6";
