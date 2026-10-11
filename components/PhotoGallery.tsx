"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GalleryPhoto = { id: string; full: string; thumb: string; credit: string | null; caption: string | null };

// Approved production photos: a thumbnail grid, and a full-screen viewer
// with swipe (phones), arrow keys and Escape (keyboards), and 44px buttons.
export function PhotoGallery({ photos, title }: { photos: GalleryPhoto[]; title: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={(e) => {
                opener.current = e.currentTarget;
                setIndex(i);
              }}
              className="block aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-md border-0 bg-soft p-0"
              aria-label={`Open photo ${i + 1} of ${photos.length}`}
            >
              <img src={p.thumb} alt={p.caption ?? `${title}, photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {index !== null && (
        <Viewer
          photos={photos}
          title={title}
          index={index}
          onStep={(step) => setIndex((i) => (i === null ? null : (i + step + photos.length) % photos.length))}
          onClose={() => {
            setIndex(null);
            opener.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Viewer({
  photos,
  title,
  index,
  onStep,
  onClose,
}: {
  photos: GalleryPhoto[];
  title: string;
  index: number;
  onStep: (step: number) => void; // relative, so quick repeated presses all count
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const photo = photos[index];
  const many = photos.length > 1;
  const go = useCallback((step: number) => onStep(step), [onStep]);

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) go(1);
      else if (e.key === "ArrowLeft" && many) go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, many, onClose]);

  // Preload the neighbours so swiping feels instant
  useEffect(() => {
    if (!many) return;
    for (const step of [1, -1]) new Image().src = photos[(index + step + photos.length) % photos.length].full;
  }, [index, many, photos]);

  const iconButton =
    "flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-lg border-0 bg-white/10 text-white hover:bg-white/20";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photos`}
      className="fixed inset-0 z-50 flex flex-col bg-[#0B0B0B] text-white"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null || !many) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 md:px-5">
        <span className="text-sm text-white/80" aria-live="polite">
          {index + 1} of {photos.length}
        </span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={iconButton}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 md:px-16">
        <img
          key={photo.id}
          src={photo.full}
          alt={photo.caption ?? `${title}, photo ${index + 1}`}
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
        />
        {many && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={`${iconButton} absolute left-2 top-1/2 -translate-y-1/2 md:left-4`}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className={`${iconButton} absolute right-2 top-1/2 -translate-y-1/2 md:right-4`}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>

      <div className="min-h-12 px-4 py-3 text-center text-sm text-white/80">
        {photo.caption && <span className="text-white">{photo.caption} </span>}
        {photo.credit && <span>Photo: {photo.credit}</span>}
      </div>
    </div>
  );
}
