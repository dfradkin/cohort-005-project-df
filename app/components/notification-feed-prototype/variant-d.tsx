/**
 * PROTOTYPE — THROWAWAY. Variant D: THE WINNER — C's shell, B's rows.
 *
 * C won the placement question: the Feed is an overlay hung off a bell in a
 * slim top bar, so it costs the layout nothing and never loses your place
 * mid-lesson. B won the row: a tinted key tile, the actor's face, the line of
 * copy, the destination spelled out, and a tick to clear a row without
 * following it. B's rows are wider than C's were, so the panel grows to 420px
 * and the destination truncates.
 *
 * Read/seen (C's policy, unchanged): opening the panel marks everything SEEN,
 * so the badge clears the moment you look — that is what seen means. READ is
 * per row, on click-through or on the tick, and the unread tint survives until
 * then.
 *
 * Deliberately dropped in the merge: C's blue unread dot. B's row already says
 * unread three ways (background tint, semibold copy, an un-ticked tick), and a
 * fourth is noise. Easy to put back if the tint reads too quietly.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Bell, Check, CheckCheck, Inbox } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import type { ProtoFeed } from "~/lib/notification-feed.prototype.server";
import { keyMeta, relativeTime, useFeedState, StateReadout } from "./shared";

export const variantName = "WINNER — bell, worklist rows";

export function VariantD({ feed }: { feed: ProtoFeed }) {
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
    const aRead = a.readAt ? 1 : 0;
    const bRead = b.readAt ? 1 : 0;
    if (aRead !== bRead) return aRead - bRead;
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
          <div className="absolute right-0 top-11 w-[420px] overflow-hidden rounded-xl border bg-popover shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {unreadCount} unread
                  </span>
                )}
              </span>
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

            <div className="max-h-[440px] overflow-y-auto">
              {sorted.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <Inbox className="size-7 opacity-40" />
                  <span className="text-sm">You're all caught up.</span>
                </div>
              )}

              {sorted.map((entry) => {
                const meta = keyMeta[entry.key];
                const unread = !entry.readAt;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "group flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50",
                      unread && "bg-primary/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted",
                        meta.tint
                      )}
                      title={entry.key}
                    >
                      {meta.icon}
                    </span>

                    {entry.actor ? (
                      <UserAvatar
                        name={entry.actor.name}
                        avatarUrl={entry.actor.avatarUrl}
                        className="size-7 shrink-0"
                      />
                    ) : (
                      <span className="size-7 shrink-0" />
                    )}

                    <button
                      onClick={() => {
                        markRead(entry.id);
                        setOpen(false);
                        navigate(entry.actionUrl);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div
                        className={cn(
                          "text-sm leading-snug",
                          unread
                            ? "font-semibold"
                            : "text-muted-foreground"
                        )}
                      >
                        {entry.body}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/70">
                        <span className="shrink-0">
                          {relativeTime(entry.insertedAt)}
                        </span>
                        <span className="shrink-0">·</span>
                        <ArrowRight className="size-3 shrink-0" />
                        <span className="truncate font-mono">
                          {entry.actionUrl}
                        </span>
                      </div>
                    </button>

                    {unread ? (
                      <button
                        onClick={() => markRead(entry.id)}
                        title="Mark read"
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
                      >
                        <Check className="size-4" />
                      </button>
                    ) : (
                      <span className="shrink-0 p-1.5">
                        <Check className="size-4 text-muted-foreground/30" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <StateReadout
              total={entries.length}
              unread={unreadCount}
              unseen={unseenCount}
              source={feed.source}
              policy="seen on panel open (badge clears) · read on click-through or tick"
            />
          </div>
        )}
      </div>
    </div>
  );
}
