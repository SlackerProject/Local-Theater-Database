"use client";

import { useState } from "react";

// Shows the first few items; "See all" reveals the rest (items marked with
// group-data-[collapsed=true]:hidden stay hidden until then)
export function SeeAll({ total, children }: { total: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group flex flex-col gap-3" data-collapsed={!open}>
      {children}
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="btn-text self-start">
          See all {total}
        </button>
      )}
    </div>
  );
}
