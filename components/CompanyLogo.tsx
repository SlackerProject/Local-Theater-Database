import { mediaUrl } from "@/lib/media";
import { SHOW_COMPANY_LOGOS } from "@/lib/brand";

// A company's logo, the way a headshot stands for a person: on white in a
// rounded square, so logos of any shape sit centered. Without one, the
// company's initials. Shows nothing while logos are switched off.
export function CompanyLogo({
  thumbKey,
  name,
  size = 44,
  className = "",
}: {
  thumbKey: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}) {
  if (!SHOW_COMPANY_LOGOS) return null;
  const src = mediaUrl(thumbKey);
  const box = { width: size, height: size };
  if (src) {
    return (
      <span style={box} className={`flex flex-none items-center justify-center overflow-hidden rounded-lg border border-rule bg-white p-[8%] ${className}`}>
        <img src={src} alt="" loading="lazy" className="block max-h-full max-w-full object-contain" />
      </span>
    );
  }
  const initials = name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      style={{ ...box, fontSize: Math.round(size * 0.36) }}
      className={`flex flex-none items-center justify-center rounded-lg bg-soft font-extrabold text-muted ${className}`}
    >
      {initials || "?"}
    </span>
  );
}
