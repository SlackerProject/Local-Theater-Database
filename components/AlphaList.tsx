import Link from "next/link";

export type AlphaItem = { key: string; href: string; label: string; sortKey: string; detail?: string };

// An A–Z list grouped by first letter, used by the Shows, People and Companies pages
export function AlphaList({ items, empty }: { items: AlphaItem[]; empty: string }) {
  if (!items.length) return <p className="m-0 text-muted">{empty}</p>;

  const groups = new Map<string, AlphaItem[]>();
  for (const item of [...items].sort((a, b) => a.sortKey.localeCompare(b.sortKey))) {
    const first = item.sortKey.trim().charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), item]);
  }

  return (
    <>
      <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
        {[...groups.keys()].map((letter) => (
          <a key={letter} href={`#letter-${letter}`} className="link-quiet flex h-11 w-11 items-center justify-center rounded-lg bg-soft font-bold">
            {letter}
          </a>
        ))}
      </nav>
      {[...groups.entries()].map(([letter, group]) => (
        <section key={letter} id={`letter-${letter}`} className="flex scroll-mt-4 flex-col">
          <h2 className="heading border-b border-rule pb-2">{letter}</h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-x-10 p-0 md:grid-cols-2">
            {group.map((item) => (
              <li key={item.key} className="border-b border-rule">
                <Link href={item.href} className="link-quiet flex min-h-11 flex-col justify-center py-2.5">
                  <span className="font-bold">{item.label}</span>
                  {item.detail && <span className="text-sm text-muted">{item.detail}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function ListPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
      <div className="flex flex-col gap-2">
        <h1 className="display text-[40px] md:text-[56px]">{title}</h1>
        <p className="m-0 text-muted">{intro}</p>
      </div>
      {children}
    </main>
  );
}
