"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MediaPalette } from "@/lib/media";
import { reviewUploads } from "./actions";

export type QueueItem = {
  id: string;
  kind: "production_photo" | "poster" | "headshot" | "logo";
  thumb: string;
  full: string;
  credit: string | null;
  palette: MediaPalette | null;
  uploader: string;
  uploaderMedal?: React.ReactNode;
  replaces?: string | null; // the current poster this one would replace
  uploadedAt: string;
};

export type QueueGroup = { key: string; label: string; href: string; items: QueueItem[] };

const KIND: Record<QueueItem["kind"], string> = {
  production_photo: "Photo",
  poster: "Poster",
  headshot: "Headshot",
  logo: "Logo",
};

// Pending uploads, grouped by production, person or company
export function UploadQueue({ groups }: { groups: QueueGroup[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  function review(ids: string[], approve: boolean, note = "") {
    setProblems([]);
    startTransition(async () => {
      const result = await reviewUploads(ids, approve, note);
      setProblems(result.problems);
      if (result.ok) setNotice(`${approve ? "Approved" : "Rejected"} ${ids.length} ${ids.length === 1 ? "upload" : "uploads"}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <p role="status" className="callout m-0">
          {notice}
        </p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="callout text-[15px]">
          <strong>Some reviews didn’t go through:</strong>
          <ul className="m-0 mt-1 pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2 border-t border-rule pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-base font-bold">
              <Link href={g.href}>{g.label}</Link>{" "}
              <span className="text-sm font-normal text-muted">
                · {g.items.length} {g.items.length === 1 ? "upload" : "uploads"}
              </span>
            </h3>
            {g.items.length > 1 && (
              <button type="button" className="btn-primary min-h-10 px-4 text-sm" disabled={pending} onClick={() => review(g.items.map((i) => i.id), true)}>
                Approve all {g.items.length}
              </button>
            )}
          </div>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-5">
            {g.items.map((item) => (
              <UploadCard key={item.id} item={item} pending={pending} onReview={review} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function UploadCard({
  item,
  pending,
  onReview,
}: {
  item: QueueItem;
  pending: boolean;
  onReview: (ids: string[], approve: boolean, note?: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <a href={item.full} target="_blank" rel="noopener noreferrer" className="block" title="Open full size">
        <div
          className="flex aspect-square w-full items-center overflow-hidden rounded-md"
          style={{ background: item.palette?.ground ?? "#F5F5F4" }}
        >
          <img src={item.thumb} alt={`${KIND[item.kind]} uploaded by ${item.uploader}`} className="h-full w-full object-contain" />
        </div>
      </a>
      {item.replaces && (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <img src={item.replaces} alt="The current poster" className="h-12 w-auto rounded-[2px] border border-rule" />
          <span>
            <strong className="text-ink">Replaces</strong> the current poster
          </span>
        </div>
      )}
      <div className="flex flex-col text-[13px] leading-snug" title={`${item.uploadedAt}. Rights and 18+ confirmed by the uploader.`}>
        <span>
          <strong>{KIND[item.kind]}</strong> by {item.uploader.split(" (")[0]} {item.uploaderMedal}
        </span>
        {item.credit && <span className="truncate text-muted">Credit: {item.credit}</span>}
      </div>
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Reason <span className="font-normal text-muted">(optional)</span>
            <input autoFocus className="field h-10 px-2 font-normal" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn-primary min-h-9 px-3 text-sm" disabled={pending} onClick={() => onReview([item.id], false, note)}>
              Reject and delete
            </button>
            <button type="button" className="btn-secondary min-h-9 px-3 text-sm" disabled={pending} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn-primary min-h-9 px-3 text-sm" disabled={pending} onClick={() => onReview([item.id], true)}>
            Approve
          </button>
          <button type="button" className="btn-secondary min-h-9 px-3 text-sm" disabled={pending} onClick={() => setRejecting(true)}>
            Reject
          </button>
        </div>
      )}
    </li>
  );
}
