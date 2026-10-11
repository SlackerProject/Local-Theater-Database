import Link from "next/link";
import type { PageKind } from "@/lib/corrections";

// Corrections, BoardGameGeek-style: every page has an Edit button that opens
// its correction form. Members' corrections go to the moderators.

function editHref(kind: PageKind, slug: string, signedIn: boolean, anchor = "") {
  const href = `/edit/${kind}/${slug}${anchor}`;
  return signedIn ? href : `/signin?next=${encodeURIComponent(href)}`;
}

// The small Edit button beside a page's title (takes the hero's ink color
// on production pages)
export function EditButton({ kind, slug, signedIn, color }: { kind: PageKind; slug: string; signedIn: boolean; color?: string }) {
  return (
    <Link
      href={editHref(kind, slug, signedIn)}
      className="link-quiet inline-flex min-h-9 items-center gap-1.5 self-start rounded-md border-[1.5px] border-current px-3 text-sm font-semibold"
      style={color ? { color } : undefined}
    >
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
      </svg>
      Edit
    </Link>
  );
}

// "Spot something wrong or missing? Edit this page" at the bottom
export function SuggestEdit({ kind, slug, signedIn }: { kind: PageKind; slug: string; signedIn: boolean }) {
  return (
    <p className="m-0 border-t border-rule pt-5 text-[15px] text-muted">
      Spot something wrong or missing?{" "}
      <Link href={editHref(kind, slug, signedIn)} className="font-semibold text-ink">
        {signedIn ? "Edit this page" : "Sign in to edit this page"}
      </Link>
    </p>
  );
}

// "Know who's in the cast? Add them." on empty production sections
export function AddThemLink({ slug, signedIn, section, children }: { slug: string; signedIn: boolean; section: "cast" | "crew"; children: React.ReactNode }) {
  return (
    <Link href={editHref("production", slug, signedIn, `#${section}`)} className="font-semibold text-ink">
      {children}
    </Link>
  );
}
