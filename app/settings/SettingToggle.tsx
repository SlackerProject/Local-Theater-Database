"use client";

import { useState, useTransition } from "react";
import { saveSetting, type Setting } from "./actions";

// One on/off setting, saved as soon as it's changed
export function SettingToggle({ setting, initial, label, hint }: { setting: Setting; initial: boolean; label: string; hint: string }) {
  const [on, setOn] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1 border-b border-rule py-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            setSaved(false);
            setError("");
            start(async () => {
              const r = await saveSetting(setting, next);
              if (r.ok) setSaved(true);
              else {
                setOn(!next);
                setError(r.error ?? "That didn’t save.");
              }
            });
          }}
          className="mt-0.5 h-5 w-5 flex-none accent-ink"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{label}</span>
          <span className="text-sm text-muted">{hint}</span>
        </span>
      </label>
      {saved && (
        <span role="status" className="pl-8 text-sm text-muted">
          Saved.
        </span>
      )}
      {error && (
        <span role="alert" className="pl-8 text-sm font-semibold">
          {error}
        </span>
      )}
    </div>
  );
}
