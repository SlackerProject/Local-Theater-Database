import Link from "next/link";
import { SimplePoster } from "@/components/SimplePoster";

// A production shown as a poster tile: a fixed 4:5 box. With a poster, the
// image is contained (never cropped) on the poster's ground color; without
// one, a soft box with the title in muted 800 weight (DESIGN.md).
export function PosterTile({
  href,
  title,
  ground,
  posterUrl,
  caption,
  year,
  company,
}: {
  href?: string; // omit for a plain, non-link tile (e.g. the production's own hero)
  title: string;
  ground?: string | null;
  posterUrl?: string | null;
  caption?: React.ReactNode;
  year?: number | string | null; // for the simple poster when there's none
  company?: string | null;
}) {
  const content = (
    <>
      {posterUrl ? (
        <div
          className="flex aspect-[4/5] w-full items-center overflow-hidden rounded-[4px] shadow-[0_6px_16px_rgba(0,0,0,0.15)]"
          style={{ background: ground ?? "#F5F5F4" }}
        >
          <img src={posterUrl} alt={`${title} poster`} loading="lazy" className="block h-full w-full object-contain" />
        </div>
      ) : (
        <div className="flex aspect-[4/5] w-full overflow-hidden rounded-[4px]">
          <SimplePoster title={title} year={year} company={company} />
        </div>
      )}
      {caption && <span className="flex flex-col leading-[1.3] group-hover:underline">{caption}</span>}
    </>
  );

  return href ? (
    <Link href={href} className="link-quiet group flex min-w-0 flex-col gap-2 text-ink">
      {content}
    </Link>
  ) : (
    <div className="flex min-w-0 flex-col gap-2">{content}</div>
  );
}
