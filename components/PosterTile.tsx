import Link from "next/link";

// A production shown as a poster tile: a fixed 4:5 box. With a poster, the
// image is contained (never cropped) on the poster's ground color; without
// one, a soft box with the title in muted 800 weight (DESIGN.md).
export function PosterTile({
  href,
  title,
  ground,
  posterUrl,
  caption,
}: {
  href?: string; // omit for a plain, non-link tile (e.g. the production's own hero)
  title: string;
  ground?: string | null;
  posterUrl?: string | null;
  caption?: React.ReactNode;
}) {
  const content = (
    <>
      {posterUrl ? (
        <div
          className="flex aspect-[4/5] w-full items-center overflow-hidden rounded-[4px] shadow-[0_6px_16px_rgba(0,0,0,0.15)]"
          style={{ background: ground ?? "#F5F5F4" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- posters come from storage in a later milestone */}
          <img src={posterUrl} alt={`${title} poster`} className="block h-full w-full object-contain" />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="box-border flex aspect-[4/5] w-full items-end rounded-[4px] border border-rule bg-soft p-3 text-sm font-extrabold leading-[1.1] text-muted"
        >
          {title}
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
