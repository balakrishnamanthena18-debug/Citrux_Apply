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
    <section className="relative overflow-hidden rounded-[22px] border border-[#DDE5E0] bg-[linear-gradient(145deg,#0B3B2C_0%,#0F4A37_48%,#126B45_100%)] text-white shadow-[0_24px_60px_rgba(11,59,44,0.18)] sm:rounded-[28px]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 12% 18%, rgba(198,244,50,0.45), transparent 42%), radial-gradient(circle at 88% 12%, rgba(255,255,255,0.18), transparent 36%)",
        }}
      />
      <div className="relative px-4 py-5 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
          <div className="max-w-2xl space-y-2.5 sm:space-y-3">
            {eyebrow && (
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                {eyebrow}
              </div>
            )}
            <h1 className="text-[1.75rem] font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.35rem] sm:leading-[1.05]">
              {title}
            </h1>
            {description && (
              <p className="max-w-xl text-[13px] leading-relaxed text-white/70 sm:text-[15px]">
                {description}
              </p>
            )}
          </div>

          {(primaryAction || secondaryAction) && (
            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              {primaryAction && (
                <Link
                  href={primaryAction.href}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#C6F432] px-5 py-2.5 text-sm font-semibold text-[#0B3B2C] shadow-[0_10px_30px_rgba(198,244,50,0.28)] transition hover:bg-[#d4f75a] active:scale-[0.98] sm:min-h-0"
                >
                  {primaryAction.label}
                  <span aria-hidden>→</span>
                </Link>
              )}
              {secondaryAction && (
                <Link
                  href={secondaryAction.href}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/10 active:scale-[0.98] sm:min-h-0"
                >
                  {secondaryAction.label}
                </Link>
              )}
            </div>
          )}
        </div>

        {tiles && tiles.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-8 xl:grid-cols-5">
            {tiles.map((tile) => {
              const tone = tile.tone || (tile.count > 0 ? "amber" : "neutral");
              return (
                <Link
                  key={tile.label}
                  href={tile.href}
                  className={`group rounded-[16px] border px-3 py-3 transition sm:rounded-[18px] sm:px-4 sm:py-3.5 ${
                    tile.count > 0
                      ? "border-white/15 bg-white/[0.08] hover:bg-white/[0.14]"
                      : "border-white/8 bg-black/10 hover:bg-black/15"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/45 sm:text-[11px]">
                        {tile.label}
                      </div>
                      <div className="mt-1.5 text-[1.45rem] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:mt-2 sm:text-[1.65rem]">
                        {tile.count}
                      </div>
                    </div>
                    <span
                      className={`mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-bold tabular-nums sm:h-6 sm:min-w-6 sm:px-1.5 ${
                        tile.count > 0 ? toneClasses[tone] : toneClasses.neutral
                      }`}
                    >
                      {tile.count > 0 ? "!" : "·"}
                    </span>
                  </div>
                  {tile.description && (
                    <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-white/45 group-hover:text-white/65 sm:mt-2 sm:text-[11px]">
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
