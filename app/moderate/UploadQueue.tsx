"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PaletteSwatches } from "@/components/uploads/UploadPanels";
import type { MediaPalette } from "@/lib/media";
import { reviewUploads } from "./actions";

export type QueueItem = {
  id: string;
  kind: "production_photo" | "poster" | "headshot";
  thumb: string;
  full: string;
  credit: string | null;
  palette: MediaPalette | null;
  uploader: string;
  uploadedAt: string;
};

export type QueueGroup = { key: string; label: string; href: string; items: QueueItem[] };

const KIND: Record<QueueItem["kind"], string> = {
  production_photo: "Photo",
  poster: "Poster",
  headshot: "Headshot",
};

// Pending uploads, grouped by production or person
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
    <div className="flex flex-col gap-8">
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
        <section key={g.key} className="flex flex-col gap-3 border-t-2 border-ink pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-xl font-extrabold">
              <Link href={g.href}>{g.label}</Link>{" "}
              <span className="text-base font-normal text-muted">
                · {g.items.length} {g.items.length === 1 ? "upload" : "uploads"}
              </span>
            </h3>
            {g.items.length > 1 && (
              <button type="button" className="btn-primary" disabled={pending} onClick={() => review(g.items.map((i) => i.id), true)}>
                Approve all {g.items.length}
              </button>
            )}
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
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
    <li className="flex flex-col gap-2.5 border-b border-rule pb-4">
      <a href={item.full} target="_blank" rel="noopener noreferrer" className="block" title="Open full size">
        <div
          className={`flex w-full items-center overflow-hidden rounded-md ${item.kind === "production_photo" ? "aspect-[4/3]" : "aspect-[4/5] max-w-[220px]"}`}
          style={{ background: item.palette?.ground ?? "#F5F5F4" }}
        >
          <img src={item.thumb} alt={`${KIND[item.kind]} uploaded by ${item.uploader}`} className="h-full w-full object-contain" />
        </div>
      </a>
      <div className="flex flex-col gap-0.5 text-sm">
        <span>
          <span className="tag mr-1.5">{KIND[item.kind]}</span>
          by {item.uploader} · {item.uploadedAt}
        </span>
        {item.credit && <span className="text-muted">Photo credit: {item.credit}</span>}
        <span className="text-muted">Rights and 18+ confirmed by the uploader.</span>
      </div>
      {item.palette && <PaletteSwatches palette={item.palette} />}
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-[15px] font-semibold">
            Reason <span className="font-normal text-muted">(optional, kept for the record)</span>
            <input className="field h-12 px-3 font-normal" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pending} onClick={() => onReview([item.id], false, note)}>
              Reject and delete
            </button>
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={pending} onClick={() => onReview([item.id], true)}>
            Approve
          </button>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => setRejecting(true)}>
            Reject
          </button>
        </div>
      )}
    </li>
  );
}
