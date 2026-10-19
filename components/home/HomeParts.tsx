import Link from "next/link";
import type { Tile } from "@/lib/home";
import { getHotProductions, hotlistUpdated } from "@/lib/hotlist";
import { latestUpdates, postDate } from "@/lib/updates";

// Pieces of the home page (home.html / home-mobile.html)

// A poster tile: the poster contained on its ground, with a 1px edge
export function HomeTile({ t }: { t: Tile }) {
  return (
    <Link href={t.href} className="link-quiet group flex min-w-0 flex-col gap-2 text-ink">
      <span className="flex aspect-[4/5] overflow-hidden rounded-[4px] border" style={{ background: t.background, borderColor: t.borderColor }}>
        {t.poster ? (
          <img src={t.poster} alt={`${t.showTitle} poster`} loading="lazy" className="block h-full w-full object-contain" />
        ) : (
          <span className="self-end p-2.5 text-[13px] font-extrabold leading-[1.1] text-muted">{t.title}</span>
        )}
      </span>
      <span className="flex flex-col leading-[1.3]">
        <span className="font-bold group-hover:underline">{t.title}</span>
        {t.line && <span className="text-[13px] text-muted">{t.line}</span>}
      </span>
    </Link>
  );
}

export function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {tiles.map((t) => (
        <HomeTile key={t.id} t={t} />
      ))}
    </div>
  );
}

export function PlayingNow({ tiles }: { tiles: Tile[] }) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="heading">Playing now and coming soon</h2>
        <Link href="/shows" className="inline-flex min-h-11 items-center whitespace-nowrap font-semibold">
          See all shows
        </Link>
      </div>
      {tiles.length ? (
        <TileGrid tiles={tiles} />
      ) : (
        <p className="m-0 text-muted">Shows will appear here as members add them.</p>
      )}
    </section>
  );
}

// The Hotlist: the top 10 productions
export async function HotlistBox() {
  const [productions, updated] = await Promise.all([getHotProductions(10), hotlistUpdated()]);
  const row = "link-quiet flex items-center gap-3 border-b border-rule py-2.5 text-ink";
  const rank = "w-[22px] flex-none text-right text-xl font-extrabold text-muted";

  return (
    <aside aria-label="Hotlist" className="flex min-w-0 flex-col gap-[18px] rounded-[10px] border border-rule p-6">
      <h2 className="heading">Hotlist</h2>
      <section>
        {productions.length ? (
          productions.map((p) => (
            <Link key={p.id} href={p.href} className={row}>
              <span className={rank}>{p.rank}</span>
              <span aria-hidden="true" className="flex h-[42px] w-[34px] flex-none overflow-hidden rounded-[3px] border" style={{ background: p.background, borderColor: p.borderColor }}>
                {p.poster && <img src={p.poster} alt="" className="h-full w-full object-contain" />}
              </span>
              <span className="flex min-w-0 flex-col leading-[1.3]">
                <span className="truncate font-bold">{p.name}</span>
                <span className="truncate text-[13px] text-muted">{p.company}</span>
              </span>
            </Link>
          ))
        ) : (
          <p className="m-0 py-2 text-sm text-muted">Production pages visited this week will appear here.</p>
        )}
      </section>
      <Link href="/hotlist" className="btn-secondary min-h-12">
        See the full Hotlist
      </Link>
      <span className="-mt-2 text-[13px] text-muted">The most-visited productions over the last 7 days. {updated}.</span>
    </aside>
  );
}

// Phones: the latest update as one line at the top of the home page
export async function LatestUpdateBar() {
  const [post] = await latestUpdates(1);
  if (!post) return null;
  return (
    <Link href={`/updates/${post.slug}`} className="link-quiet flex items-center gap-2 rounded-lg bg-soft px-3.5 py-2.5 text-[15px] text-ink md:hidden">
      <span className="flex-none rounded bg-ink px-1.5 text-[12px] font-bold leading-5 text-white">Update</span>
      <span className="min-w-0 flex-1 truncate font-semibold">{post.title}</span>
      <span aria-hidden="true" className="flex-none font-bold">
        →
      </span>
    </Link>
  );
}

// The three latest Updates
export async function UpdatesBox() {
  const posts = await latestUpdates(3);
  return (
    <section aria-label="Updates" className="flex flex-col gap-1 px-1">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-lg font-extrabold tracking-[-0.01em]">Updates</h2>
        <Link href="/updates" className="inline-flex min-h-11 items-center text-sm font-semibold">
          All updates
        </Link>
      </div>
      {posts.length ? (
        <ul className="m-0 list-none border-t border-rule p-0">
          {posts.map((p) => (
            <li key={p.id} className="border-b border-rule py-3">
              <Link href={`/updates/${p.slug}`} className="link-quiet flex flex-col gap-0.5 text-ink">
                <span className="text-[13px] text-muted">{postDate(p.published_at)}</span>
                <span className="text-base font-extrabold leading-[1.3]">{p.title}</span>
                {p.summary && <span className="text-sm leading-[1.4] text-muted">{p.summary}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 border-t border-rule pt-3 text-sm text-muted">News about the site will appear here.</p>
      )}
    </section>
  );
}
