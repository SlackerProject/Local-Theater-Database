"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ACCEPT_ATTR, processImage, uploadProcessed } from "@/lib/imageUpload";
import { mediaUrl } from "@/lib/media";
import { POST_BODY, renderPost } from "@/lib/markdown";
import { publishPost, savePost, unpublishPost } from "./actions";

export type EditablePost = { id: string; slug: string; title: string; summary: string; body: string; status: "draft" | "published" };

const tool = "inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-md border border-[#CFCFCF] bg-page px-3 text-sm font-semibold hover:border-ink disabled:opacity-50";

// The admin's editor for site updates: title, summary, and a body with a
// formatting toolbar and image upload; Save draft, Preview, Publish, and
// later Save changes or Unpublish
export function PostEditor({ post, userId }: { post: EditablePost | null; userId: string }) {
  const router = useRouter();
  const [id, setId] = useState(post?.id ?? null);
  const [slug, setSlug] = useState(post?.slug ?? null);
  const [status, setStatus] = useState<"draft" | "published">(post?.status ?? "draft");
  const [title, setTitle] = useState(post?.title ?? "");
  const [summary, setSummary] = useState(post?.summary ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Wrap the selected text (or insert at the cursor) and keep editing there
  function apply(before: string, after = "", placeholder = "") {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const selected = body.slice(s, e) || placeholder;
    const next = body.slice(0, s) + before + selected + after + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  // Start a line with a marker ("## ", "- ")
  function lineStart(marker: string, placeholder: string) {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineBegin = body.lastIndexOf("\n", s - 1) + 1;
    const atBlank = lineBegin === s && (body[s] === "\n" || s === body.length);
    const next = body.slice(0, lineBegin) + marker + (atBlank ? placeholder : "") + body.slice(lineBegin);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = lineBegin + marker.length;
      el.setSelectionRange(pos, pos + (atBlank ? placeholder.length : 0));
    });
  }

  function addLink() {
    const url = window.prompt("Link address (starting with https://)", "https://");
    if (!url || !/^https?:\/\/\S+/.test(url)) return;
    apply("[", `](${url})`, "link text");
  }

  async function addImage(file: File) {
    setError("");
    setUploading(true);
    try {
      const image = await processImage(file);
      const uploaded = await uploadProcessed(createClient(), userId, image);
      const alt = (window.prompt("Describe the image for people who can’t see it (shown as its caption)", "") ?? "").replace(/[[\]]/g, "");
      const el = area.current;
      const at = el ? el.selectionEnd : body.length;
      const insert = `\n\n![${alt}](${mediaUrl(uploaded.storage_key)})\n\n`;
      setBody((b) => b.slice(0, at) + insert + b.slice(at));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image couldn’t be uploaded.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save(): Promise<{ id: string; slug: string } | null> {
    setError("");
    setMessage("");
    if (!title.trim()) {
      setError("Add a title first.");
      return null;
    }
    const r = await savePost(id, title, summary, body);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    if (!id) router.replace(`/updates/${r.slug}/edit`);
    setId(r.id);
    setSlug(r.slug);
    return r;
  }

  const onSave = () =>
    start(async () => {
      if (await save()) setMessage(status === "published" ? "Changes saved and live." : "Draft saved.");
    });

  const onPublish = () =>
    start(async () => {
      const saved = await save();
      if (!saved) return;
      const r = await publishPost(saved.id);
      if (!r.ok) return setError(r.error);
      setStatus("published");
      setMessage(
        `Published.${r.notified ? ` ${r.notified} ${r.notified === 1 ? "member was" : "members were"} notified.` : ""}`,
      );
    });

  const onUnpublish = () =>
    start(async () => {
      if (!id) return;
      const r = await unpublishPost(id);
      if (!r.ok) return setError(r.error);
      setStatus("draft");
      setMessage("Unpublished. It’s a draft again; only you can see it.");
    });

  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <p className="m-0 text-[15px] text-muted">
        {status === "published" ? (
          <>
            <strong className="text-ink">Published.</strong> Changes go live when you save.
          </>
        ) : (
          <>
            <strong className="text-ink">Draft.</strong> Only you can see it until you publish. Publishing tells members with
            a notification (once).
          </>
        )}
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="font-bold">Title</span>
        <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} className="field h-12 px-3 text-lg font-semibold" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-bold">
          Summary <span className="font-normal text-muted">(one line, shown on the home page and the Updates list)</span>
        </span>
        <textarea value={summary} maxLength={300} rows={2} onChange={(e) => setSummary(e.target.value)} className="field p-3" />
        <span className="self-end text-xs text-muted">{summary.length} / 300</span>
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold">Body</span>
          <div role="tablist" aria-label="Write or preview" className="inline-flex rounded-lg bg-soft p-1">
            {(["Write", "Preview"] as const).map((t) => {
              const on = (t === "Preview") === preview;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setPreview(t === "Preview")}
                  className={`min-h-9 cursor-pointer rounded-md border-0 px-4 text-sm font-semibold ${on ? "bg-page shadow-sm" : "bg-transparent text-muted"}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {preview ? (
          <div className="min-h-[300px] rounded-lg border border-rule p-5">
            <h2 className="m-0 mb-4 text-[30px] font-extrabold leading-tight tracking-[-0.02em]">{title || "Untitled"}</h2>
            <div className={POST_BODY}>{body.trim() ? renderPost(body) : <p className="text-muted">Nothing written yet.</p>}</div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Formatting">
              <button type="button" className={tool} onClick={() => lineStart("## ", "Heading")}>
                Heading
              </button>
              <button type="button" className={tool} onClick={() => lineStart("### ", "Subheading")}>
                Subheading
              </button>
              <button type="button" className={`${tool} font-extrabold`} onClick={() => apply("**", "**", "bold text")}>
                Bold
              </button>
              <button type="button" className={`${tool} italic`} onClick={() => apply("*", "*", "italic text")}>
                Italic
              </button>
              <button type="button" className={tool} onClick={addLink}>
                Link
              </button>
              <button type="button" className={tool} onClick={() => lineStart("- ", "List item")}>
                • List
              </button>
              <button type="button" className={tool} disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? "Uploading…" : "Image"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])}
              />
            </div>
            <textarea
              ref={area}
              aria-label="Body"
              value={body}
              rows={18}
              onChange={(e) => setBody(e.target.value)}
              className="field p-3 font-mono text-[15px] leading-relaxed"
            />
            <span className="text-xs text-muted">
              Leave a blank line between paragraphs. Use Preview to see how it will look.
            </span>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-rule pt-4">
        <button type="button" disabled={pending} onClick={onSave} className="btn-secondary">
          {status === "published" ? "Save changes" : "Save draft"}
        </button>
        <button type="button" onClick={() => setPreview((v) => !v)} className="btn-secondary">
          {preview ? "Back to writing" : "Preview"}
        </button>
        {status === "draft" ? (
          <button type="button" disabled={pending} onClick={onPublish} className="btn-primary">
            Publish
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={onUnpublish} className="btn-secondary">
            Unpublish
          </button>
        )}
        {slug && (
          <Link href={`/updates/${slug}`} className="ml-auto font-semibold">
            View the post
          </Link>
        )}
      </div>
      {message && (
        <p role="status" className="callout m-0">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="callout m-0 font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
