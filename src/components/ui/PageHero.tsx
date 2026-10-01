import Link from "next/link";
import type { ReactNode } from "react";

type AttentionTone = "amber" | "rose" | "blue" | "neutral";

export interface PageHeroAction {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

export interface PageHeroTile {
  label: string;
  count: number;
  href: string;
  description?: string;
  tone?: AttentionTone;
}

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  description?: string;
  primaryAction?: PageHeroAction;
  secondaryAction?: PageHeroAction;
  tiles?: PageHeroTile[];
  children?: ReactNode;
}

const toneClasses: Record<AttentionTone, string> = {
  amber: "bg-amber-50 text-amber-900 border-amber-200/80",
  rose: "bg-rose-50 text-rose-800 border-rose-200/80",
  blue: "bg-sky-50 text-sky-800 border-sky-200/80",
  neutral: "bg-white/5 text-white/50 border-white/10",
};

/**
 * Forest command hero used by Operations Overview and role home screens.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  tiles,
  children,
}: PageHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#DDE5E0] bg-[linear-gradient(145deg,#0B3B2C_0%,#0F4A37_48%,#126B45_100%)] text-white shadow-[0_24px_60px_rgba(11,59,44,0.18)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 12% 18%, rgba(198,244,50,0.45), transparent 42%), radial-gradient(circle at 88% 12%, rgba(255,255,255,0.18), transparent 36%)",
        }}
      />
      <div className="relative px-6 py-7 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            {eyebrow && (
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                {eyebrow}
              </div>
            )}
            <h1 className="text-[2rem] sm:text-[2.35rem] font-semibold tracking-[-0.04em] leading-[1.05] text-balance">
              {title}
            </h1>
            {description && (
              <p className="text-sm sm:text-[15px] leading-relaxed text-white/70 max-w-xl">
                {description}
              </p>
            )}
          </div>

          {(primaryAction || secondaryAction) && (
            <div className="flex flex-wrap items-center gap-2.5">
              {primaryAction && (
                <Link
                  href={primaryAction.href}
                  className="inline-flex items-center gap-2 rounded-full bg-[#C6F432] px-5 py-2.5 text-sm font-semibold text-[#0B3B2C] shadow-[0_10px_30px_rgba(198,244,50,0.28)] transition hover:bg-[#d4f75a] active:scale-[0.98]"
                >
                  {primaryAction.label}
                  <span aria-hidden>→</span>
                </Link>
              )}
              {secondaryAction && (
                <Link
                  href={secondaryAction.href}
                  className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/10"
                >
                  {secondaryAction.label}
                </Link>
              )}
            </div>
          )}
        </div>

        {tiles && tiles.length > 0 && (
          <div className="mt-8 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {tiles.map((tile) => {
              const tone = tile.tone || (tile.count > 0 ? "amber" : "neutral");
              return (
                <Link
                  key={tile.label}
                  href={tile.href}
                  className={`group rounded-[18px] border px-4 py-3.5 transition ${
                    tile.count > 0
                      ? "border-white/15 bg-white/[0.08] hover:bg-white/[0.14]"
                      : "border-white/8 bg-black/10 hover:bg-black/15"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
                        {tile.label}
                      </div>
                      <div className="mt-2 text-[1.65rem] font-semibold tracking-[-0.04em] tabular-nums leading-none">
                        {tile.count}
                      </div>
                    </div>
                    <span
                      className={`mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[10px] font-bold tabular-nums ${
                        tile.count > 0 ? toneClasses[tone] : toneClasses.neutral
                      }`}
                    >
                      {tile.count > 0 ? "!" : "·"}
                    </span>
                  </div>
                  {tile.description && (
                    <p className="mt-2 text-[11px] leading-snug text-white/45 group-hover:text-white/65">
                      {tile.description}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {children}
      </div>
    </section>
  );
}
