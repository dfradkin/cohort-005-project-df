/**
 * PROTOTYPE — THROWAWAY. Floating variant switcher.
 *
 * Deliberately ugly (dashed amber pill) so it never reads as part of the design
 * being judged. Writes `?variant=` so a variant is shareable and reload-stable,
 * and cycles with the arrow keys. Never rendered in a production build.
 */
import { useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  names,
  param = "variant",
  caption,
}: {
  variants: string[];
  names?: Record<string, string>;
  param?: string;
  caption?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  if (import.meta.env.PROD) return null;

  const current = searchParams.get(param) ?? variants[0]!;
  const index = Math.max(variants.indexOf(current), 0);

  function go(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length]!;
    const params = new URLSearchParams(searchParams);
    params.set(param, next);
    navigate(`${location.pathname}?${params}`, {
      replace: true,
      preventScrollReset: true,
    });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border-2 border-dashed border-amber-500 bg-amber-50/95 px-1.5 py-1 shadow-xl backdrop-blur dark:bg-amber-950/90">
        <button
          onClick={() => go(-1)}
          className="rounded-full p-1.5 text-amber-900 transition hover:bg-amber-200 dark:text-amber-200 dark:hover:bg-amber-900"
          aria-label="Previous variant"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="px-2 text-center">
          <div className="whitespace-nowrap text-xs font-bold text-amber-900 dark:text-amber-100">
            PROTOTYPE · {current}
            {names?.[current] ? ` (${names[current]})` : ""}
          </div>
          {caption && (
            <div className="whitespace-nowrap text-[10px] text-amber-800/70 dark:text-amber-200/60">
              {caption}
            </div>
          )}
        </div>
        <button
          onClick={() => go(1)}
          className="rounded-full p-1.5 text-amber-900 transition hover:bg-amber-200 dark:text-amber-200 dark:hover:bg-amber-900"
          aria-label="Next variant"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
