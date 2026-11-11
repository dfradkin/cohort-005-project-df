/**
 * PROTOTYPE — THROWAWAY. Variant C: "Bell and popover."
 *
 * The Feed is an overlay. A slim top bar appears over the main column with a
 * bell on the right; the badge counts UNSEEN, and the panel drops down over
 * whatever page you're on, so you never lose your place mid-lesson. Unread
 * rows float to the top. The familiar shape, and the only one that costs the
 * layout nothing.
 *
 * Read/seen: opening the panel marks everything SEEN, so the badge clears the
 * moment you look — that is what "seen" means. READ is per row, on click, and
 * the blue dot survives until then.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import type { ProtoFeed } from "~/lib/notification-feed.prototype.server";
import { keyMeta, relativeTime, useFeedState, StateReadout } from "./shared";

export const variantName = "Bell and popover";

export function VariantC({ feed }: { feed: ProtoFeed }) {
  const navigate = useNavigate();
  const {
    entries,
    unreadCount,
    unseenCount,
    markRead,
    markAllSeen,
    markAllRead,
  } = useFeedState(feed);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Looking at it is what "seen" means.
  useEffect(() => {
    if (open) markAllSeen();
  }, [open, markAllSeen]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sorted = [...entries].sort((a, b) => {
    const aUnread = a.readAt ? 1 : 0;
    const bUnread = b.readAt ? 1 : 0;
    if (aUnread !== bUnread) return aUnread - bUnread;
    return b.insertedAt.localeCompare(a.insertedAt);
  });

  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b bg-background/80 px-6 backdrop-blur">
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "relative flex size-9 items-center justify-center rounded-full transition-colors hover:bg-accent",
            open && "bg-accent"
          )}
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unseenCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
              {unseenCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-11 w-[380px] overflow-hidden rounded-xl border bg-popover shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="size-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {sorted.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <Inbox className="size-7 opacity-40" />
                  <span className="text-sm">Nothing new.</span>
                </div>
              )}
              {sorted.map((entry) => {
                const meta = keyMeta[entry.key];
                const unread = !entry.readAt;
                return (
                  <button
                    key={entry.id}
                    onClick={() => {
                      markRead(entry.id);
                      setOpen(false);
                      navigate(entry.actionUrl);
                    }}
                    className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60"
                  >
                    <span className="relative shrink-0">
                      {entry.actor ? (
                        <UserAvatar
                          name={entry.actor.name}
                          avatarUrl={entry.actor.avatarUrl}
                          className="size-8"
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full bg-muted",
                            meta.tint
                          )}
                        >
                          {meta.icon}
                        </span>
                      )}
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-background",
                          meta.tint
                        )}
                      >
                        <span className="scale-[0.65]">{meta.icon}</span>
                      </span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm leading-snug",
                          unread ? "font-medium" : "text-muted-foreground"
                        )}
                      >
                        {entry.body}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground/70">
                        {relativeTime(entry.insertedAt)}
                      </span>
                    </span>

                    {unread && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>

            <StateReadout
              total={entries.length}
              unread={unreadCount}
              unseen={unseenCount}
              source={feed.source}
              policy="seen on panel open (badge clears) · read on click"
            />
          </div>
        )}
      </div>
    </div>
  );
}
