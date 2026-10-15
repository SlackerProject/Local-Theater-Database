"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ACCEPT_ATTR, checkFile, posterPalette, processImage, uploadProcessed, type ProcessedImage } from "@/lib/imageUpload";
import { MEDIA_BUCKET, PHOTO_LIMIT, RIGHTS_TEXT, mediaUrl, type MediaPalette } from "@/lib/media";
import type { FormState } from "@/lib/submission";

// ---------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------
export function RightsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[15px]">
      <input
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 flex-none accent-ink"
      />
      <span>
        {RIGHTS_TEXT}{" "}
        <span className="text-muted">Required. Photos can’t show anyone under 18: young performers are listed by role only.</span>
      </span>
    </label>
  );
}

export function PaletteSwatches({ palette }: { palette: MediaPalette }) {
  const swatches: [string, string][] = [
    ["Background", palette.ground],
    ["Text", palette.ink],
    ["Accent", palette.accent],
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
      {swatches.map(([name, color]) => (
        <span key={name} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-5 w-5 rounded border border-rule" style={{ background: color }} />
          {name} {color}
        </span>
      ))}
    </div>
  );
}

function FilePicker({ label, multiple, onFiles }: { label: string; multiple?: boolean; onFiles: (files: File[]) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="btn-secondary cursor-pointer">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={ACCEPT_ATTR}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <p className="m-0 mt-1.5 text-sm text-muted">JPEG, PNG or WebP. Large images are resized before uploading.</p>
    </div>
  );
}

// Supabase loads on the first upload, so it isn't part of the page's download
async function currentUserId() {
  const supabase = (await import("@/lib/supabase/client")).createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Your session ended. Sign in again, then upload.");
  return { supabase, userId: data.user.id };
}

function friendly(message: string) {
  if (/40 photos/.test(message)) return "This production has reached the 40-photo limit for now.";
  if (/row-level security/i.test(message)) return "You need to be signed in to upload.";
  return message;
}

const panel = "flex flex-col gap-4 border-l-[3px] border-rule py-1 pl-4";

// A button that opens an upload panel in place
function Opener({ label, open, onOpen, variant = "secondary" }: { label: string; open: boolean; onOpen: () => void; variant?: "secondary" | "text" }) {
  if (open) return null;
  return (
    <button type="button" className={`${variant === "text" ? "btn-text" : "btn-secondary"} self-start`} onClick={onOpen}>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------
// Production photos (several at once)
// ---------------------------------------------------------------------
type Pending = { id: string; file: File; preview: string; status: "ready" | "working" | "done" | "error"; error?: string };

export function PhotoUploader({ productionId, remaining }: { productionId: string; remaining: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Pending[]>([]);
  const [credit, setCredit] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const creditId = useId();

  // Release preview images when the panel goes away
  const previews = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const drop = (keep: (p: Pending) => boolean) =>
    setItems((cur) => {
      cur.filter((p) => !keep(p)).forEach((p) => {
        URL.revokeObjectURL(p.preview);
        previews.current.delete(p.preview);
      });
      return cur.filter(keep);
    });

  if (remaining <= 0) {
    return <p className="m-0 text-sm text-muted">This production has reached the {PHOTO_LIMIT}-photo limit for now.</p>;
  }

  function addFiles(files: File[]) {
    setMessage(null);
    const room = remaining - items.filter((i) => i.status !== "error").length;
    const accepted: Pending[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const problem = checkFile(file);
      if (problem) problems.push(problem);
      else if (accepted.length < room) {
        const preview = URL.createObjectURL(file);
        previews.current.add(preview);
        accepted.push({ id: crypto.randomUUID(), file, preview, status: "ready" });
      }
      else problems.push(`${file.name}: over the limit of ${remaining} more photos for this production.`);
    }
    setItems((current) => [...current, ...accepted]);
    if (problems.length) setMessage(problems.join(" "));
  }

  async function upload() {
    if (!rights) {
      setMessage("Please tick the box confirming you have permission to share these photos.");
      return;
    }
    setBusy(true);
    setMessage(null);
    let done = 0;
    try {
      const { supabase, userId } = await currentUserId();
      for (const item of items.filter((i) => i.status === "ready" || i.status === "error")) {
        setItems((cur) => cur.map((x) => (x.id === item.id ? { ...x, status: "working", error: undefined } : x)));
        try {
          const processed = await processImage(item.file);
          const stored = await uploadProcessed(supabase, userId, processed);
          const { error } = await supabase.from("media").insert({
            kind: "production_photo",
            production_id: productionId,
            photographer_credit: credit.trim() || null,
            uploaded_by: userId,
            rights_confirmed_at: new Date().toISOString(),
            ...stored,
          });
          if (error) {
            await supabase.storage.from(MEDIA_BUCKET).remove([stored.storage_key, stored.thumb_key]);
            throw new Error(friendly(error.message));
          }
          done++;
          setItems((cur) => cur.map((x) => (x.id === item.id ? { ...x, status: "done" } : x)));
        } catch (e) {
          const error = e instanceof Error ? e.message : "Upload failed.";
          setItems((cur) => cur.map((x) => (x.id === item.id ? { ...x, status: "error", error } : x)));
        }
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    }
    setBusy(false);
    if (done) {
      setMessage(
        `Thanks! ${done} ${done === 1 ? "photo is" : "photos are"} waiting for a moderator and will appear here once approved.`,
      );
      drop((x) => x.status !== "done");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Opener label="Upload photos" open={open} onOpen={() => setOpen(true)} />
      {open && (
        <div className={panel}>
          <FilePicker label={items.length ? "Add more photos" : "Choose photos"} multiple onFiles={addFiles} />
          {items.length > 0 && (
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-5">
              {items.map((i) => (
                <li key={i.id} className="flex flex-col gap-1">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-soft">
                    <img src={i.preview} alt="" className={`h-full w-full object-cover ${i.status === "working" ? "opacity-50" : ""}`} />
                    {i.status === "ready" && !busy && (
                      <button
                        type="button"
                        aria-label={`Remove ${i.file.name}`}
                        onClick={() => drop((x) => x.id !== i.id)}
                        className="absolute right-0 top-0 flex h-11 w-11 cursor-pointer items-start justify-end border-0 bg-transparent p-1.5"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">×</span>
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {i.status === "working" ? "Uploading…" : i.status === "error" ? <span className="text-ink">{i.error}</span> : i.file.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex max-w-[420px] flex-col gap-1.5">
            <label htmlFor={creditId} className="text-[15px] font-semibold">
              Photographer credit <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id={creditId} value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="e.g. Jane Doe Photography" className="field h-12 px-3" />
          </div>
          <RightsCheckbox checked={rights} onChange={setRights} />
          {message && (
            <p role="status" className="callout m-0 text-[15px]">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="btn-primary" disabled={busy || !items.some((i) => i.status !== "done")} onClick={upload}>
              {busy ? "Uploading…" : `Upload ${items.filter((i) => i.status !== "done").length || ""} ${items.filter((i) => i.status !== "done").length === 1 ? "photo" : "photos"}`}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setOpen(false); drop(() => false); setMessage(null); }}>
              Close
            </button>
          </div>
          <p className="m-0 text-sm text-muted">A moderator reviews photos before they appear. Up to {remaining} more for this production.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// One image: a poster (with colors) or a headshot
// ---------------------------------------------------------------------
function SingleImageUploader({
  kind,
  targetId,
  openLabel,
  openVariant,
  intro,
  done,
  inkOverride,
}: {
  kind: "poster" | "headshot" | "logo";
  targetId: string;
  openLabel: string;
  openVariant?: "secondary" | "text";
  intro: string;
  done: string;
  inkOverride?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [processed, setProcessed] = useState<ProcessedImage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [palette, setPalette] = useState<MediaPalette | null>(null);
  const [credit, setCredit] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const creditId = useId();

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(files: File[]) {
    const file = files[0];
    if (!file) return;
    setMessage(null);
    setBusy(true);
    try {
      const { bitmap, ...image } = await processImage(file);
      setProcessed(image);
      setPreview(URL.createObjectURL(image.thumb));
      setPalette(kind === "poster" ? posterPalette(bitmap) : null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "That image couldn't be used.");
    }
    setBusy(false);
  }

  async function upload() {
    if (!processed) return;
    if (!rights) {
      setMessage("Please tick the box confirming you have permission to share this image.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { supabase, userId } = await currentUserId();
      const stored = await uploadProcessed(supabase, userId, processed);
      const { error } = await supabase.from("media").insert({
        kind,
        ...(kind === "poster"
          ? { production_id: targetId, palette }
          : kind === "logo"
            ? { organization_id: targetId }
            : { person_id: targetId }),
        photographer_credit: credit.trim() || null,
        uploaded_by: userId,
        rights_confirmed_at: new Date().toISOString(),
        ...stored,
      });
      if (error) {
        await supabase.storage.from(MEDIA_BUCKET).remove([stored.storage_key, stored.thumb_key]);
        throw new Error(friendly(error.message));
      }
      setProcessed(null);
      setPreview(null);
      setPalette(null);
      setRights(false);
      setMessage(done);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3" style={inkOverride ? { color: inkOverride } : undefined}>
      <Opener label={openLabel} open={open} onOpen={() => setOpen(true)} variant={openVariant} />
      {open && (
        <div className={panel} style={inkOverride ? { borderColor: "currentColor" } : undefined}>
          <p className="m-0 text-[15px]">{intro}</p>
          <FilePicker label={processed ? "Choose a different image" : "Choose an image"} onFiles={choose} />
          {busy && !processed && <p className="m-0 text-sm">Preparing the image…</p>}
          {preview && (
            <div className="flex flex-wrap items-end gap-4">
              <div
                className={`flex ${kind === "logo" ? "aspect-square border border-rule p-2" : "aspect-[4/5]"} w-[140px] items-center overflow-hidden rounded-[4px]`}
                style={{ background: kind === "logo" ? "#FFFFFF" : (palette?.ground ?? "#F5F5F4") }}
              >
                <img src={preview} alt="Preview" className="h-full w-full object-contain" />
              </div>
              {palette && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">Colors for the production page</span>
                  <PaletteSwatches palette={palette} />
                </div>
              )}
            </div>
          )}
          {processed && (
            <>
              <div className="flex max-w-[420px] flex-col gap-1.5">
                <label htmlFor={creditId} className="text-[15px] font-semibold">
                  {kind === "poster" ? "Designer or photographer credit" : kind === "logo" ? "Designer credit" : "Photographer credit"}{" "}
                  <span className="font-normal opacity-75">(optional)</span>
                </label>
                <input id={creditId} value={credit} onChange={(e) => setCredit(e.target.value)} className="field h-12 px-3" />
              </div>
              <RightsCheckbox checked={rights} onChange={setRights} />
            </>
          )}
          {message && (
            <p role="status" className="callout m-0 text-[15px] text-ink">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            {processed && (
              <button type="button" className="btn-primary" disabled={busy} onClick={upload}>
                {busy ? "Uploading…" : "Upload"}
              </button>
            )}
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setOpen(false); setProcessed(null); setPreview(null); setMessage(null); }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PosterUploader({ productionId, hasPoster, ink }: { productionId: string; hasPoster: boolean; ink: string }) {
  return (
    <SingleImageUploader
      kind="poster"
      targetId={productionId}
      openLabel={hasPoster ? "Suggest a different poster" : "Add a poster"}
      openVariant={hasPoster ? "text" : "secondary"}
      intro="The poster's colors become this production's colors once a moderator approves it."
      done="Thanks! The poster is waiting for a moderator and will appear here once approved."
      inkOverride={ink}
    />
  );
}

export function HeadshotUploader({ personId, hasHeadshot }: { personId: string; hasHeadshot: boolean }) {
  return (
    <SingleImageUploader
      kind="headshot"
      targetId={personId}
      openLabel={hasHeadshot ? "Suggest a different headshot" : "Add a headshot"}
      openVariant="text"
      intro="A recent, clear photo of this person. It appears once a moderator approves it."
      done="Thanks! The headshot is waiting for a moderator and will appear here once approved."
    />
  );
}

export function LogoUploader({ organizationId, hasLogo }: { organizationId: string; hasLogo: boolean }) {
  return (
    <SingleImageUploader
      kind="logo"
      targetId={organizationId}
      openLabel={hasLogo ? "Suggest a different logo" : "Add a logo"}
      openVariant="text"
      intro="The company's logo, shown wherever the company appears. A file with a plain or transparent background works best. It appears once a moderator approves it."
      done="Thanks! The logo is waiting for a moderator and will appear here once approved."
    />
  );
}

// ---------------------------------------------------------------------
// Poster on the Add a production form: uploaded right away, attached to
// the submission, and saved with the production when it's approved.
// ---------------------------------------------------------------------
export type FormPoster = NonNullable<FormState["poster"]>;

export function PosterField({ value, onChange }: { value: FormPoster | null; onChange: (p: FormPoster | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(files: File[]) {
    const file = files[0];
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const { bitmap, ...image } = await processImage(file);
      const palette = posterPalette(bitmap);
      const { supabase, userId } = await currentUserId();
      const stored = await uploadProcessed(supabase, userId, image);
      if (value) await supabase.storage.from(MEDIA_BUCKET).remove([value.storage_key, value.thumb_key]);
      onChange({ ...stored, palette, rightsConfirmed: value?.rightsConfirmed ?? false });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "That image couldn't be used.");
    }
    setBusy(false);
  }

  async function remove() {
    if (!value) return;
    setBusy(true);
    try {
      const { supabase } = await currentUserId();
      await supabase.storage.from(MEDIA_BUCKET).remove([value.storage_key, value.thumb_key]);
    } catch {
      // The files are orphaned at worst; the submission no longer refers to them
    }
    onChange(null);
    setBusy(false);
  }

  const url = value ? mediaUrl(value.thumb_key) : null;

  return (
    <div className="flex flex-col gap-3">
      {value && url ? (
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex aspect-[4/5] w-[140px] items-center overflow-hidden rounded-[4px]" style={{ background: value.palette.ground }}>
            <img src={url} alt="Poster preview" className="h-full w-full object-contain" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Colors for the production page</span>
            <PaletteSwatches palette={value.palette} />
            <div className="flex flex-wrap gap-x-5">
              <FilePickerInline label="Replace" onFiles={choose} disabled={busy} />
              <button type="button" className="btn-text" disabled={busy} onClick={remove}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <FilePicker label={busy ? "Uploading…" : "Choose the poster"} onFiles={choose} />
      )}
      {busy && <p className="m-0 text-sm text-muted">Preparing and uploading the poster…</p>}
      {value && (
        <RightsCheckbox checked={value.rightsConfirmed} onChange={(rightsConfirmed) => onChange({ ...value, rightsConfirmed })} />
      )}
      {message && (
        <p role="alert" className="callout m-0 text-[15px]">
          {message}
        </p>
      )}
    </div>
  );
}

function FilePickerInline({ label, onFiles, disabled }: { label: string; onFiles: (files: File[]) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className={`btn-text ${disabled ? "pointer-events-none opacity-50" : ""}`}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}
