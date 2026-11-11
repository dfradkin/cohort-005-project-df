/**
 * PROTOTYPE — THROWAWAY. Variant A: "Lives in the nav."
 *
 * The Feed is a permanent section of the left sidebar, directly above Recent
 * Courses. No bell, no overlay, nothing to open: Notifications are always on
 * screen, so the question "is there anything for me" is answered without a
 * click. Pays for that with a hard width limit (w-56) and a short list.
 *
 * Read/seen: everything visible is marked SEEN on mount, because it genuinely
 * is in front of you. READ happens only on click.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { cn } from "~/lib/utils";
import type { ProtoFeed } from "~/lib/notification-feed.prototype.server";
import { keyMeta, relativeTime, useFeedState, StateReadout } from "./shared";

export const variantName = "Lives in the nav";

export function VariantA({ feed }: { feed: ProtoFeed }) {
  const navigate = useNavigate();
  const { entries, unreadCount, unseenCount, markRead, markAllSeen, markAllRead } =
    useFeedState(feed);

  // On screen means seen.
  useEffect(() => {
    const t = setTimeout(markAllSeen, 1200);
    return () => clearTimeout(t);
  }, [markAllSeen, entries]);

  const visible = entries.slice(0, 6);

  return (
    <div className="border-t border-sidebar-border">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          Notifications
        </div>
        {unreadCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
            {unreadCount}
          </span>
        )}
      </div>

      <div className="px-1.5 pb-1">
        {visible.length === 0 && (
          <div className="px-1.5 py-2 text-xs text-sidebar-foreground/50">
            Nothing new.
          </div>
        )}
        {visible.map((entry) => {
          const meta = keyMeta[entry.key];
          const unread = !entry.readAt;
          return (
            <button
              key={entry.id}
              onClick={() => {
                markRead(entry.id);
                navigate(entry.actionUrl);
              }}
              className={cn(
                "group flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-sidebar-accent",
                unread && "bg-sidebar-accent/40"
              )}
            >
              <span className={cn("mt-0.5 shrink-0", meta.tint)}>
                {meta.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-xs leading-snug",
                    unread
                      ? "font-medium text-sidebar-foreground"
                      : "text-sidebar-foreground/60"
                  )}
                >
                  {entry.body}
                </span>
                <span className="mt-0.5 block text-[10px] text-sidebar-foreground/40">
                  {relativeTime(entry.insertedAt)}
                </span>
              </span>
              {unread && (
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {entries.length > visible.length && (
        <div className="px-3 pb-1 text-[10px] text-sidebar-foreground/40">
          +{entries.length - visible.length} older
        </div>
      )}

      {unreadCount > 0 && (
        <button
          onClick={markAllRead}
          className="w-full px-3 pb-2 text-left text-[10px] text-sidebar-foreground/50 hover:text-sidebar-foreground"
        >
          Mark all read
        </button>
      )}

      <StateReadout
        total={entries.length}
        unread={unreadCount}
        unseen={unseenCount}
        source={feed.source}
        policy="seen on render (always visible) · read on click"
      />
    </div>
  );
}
