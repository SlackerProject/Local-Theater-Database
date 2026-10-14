"use client";

import { useEffect, useRef, useState } from "react";
import { SERVICE_AREA, SERVICE_AREA_SHORT } from "@/lib/brand";

// The region the site covers, beside the name in the header. It looks like
// a region picker; for now it only says which region this is (choosing
// another comes much later).
export function RegionButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Region: ${SERVICE_AREA}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-[#CFCFCF] bg-page px-2.5 text-[13px] font-bold text-ink hover:border-ink md:h-9 md:px-3 md:text-sm"
      >
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        {SERVICE_AREA_SHORT}
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Region"
          className="absolute left-0 top-full z-30 mt-2 flex w-[260px] flex-col gap-1.5 rounded-lg border border-rule bg-page p-4 shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
        >
          <span className="text-sm font-bold uppercase tracking-[0.06em] text-muted">Region</span>
          <span className="flex items-center justify-between gap-2 font-bold">
            {SERVICE_AREA}
            <svg aria-label="Selected" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <span className="text-sm text-muted">Every company, show and venue here is in {SERVICE_AREA}. More regions are coming later.</span>
        </div>
      )}
    </div>
  );
}
