/**
 * PROTOTYPE — THROWAWAY. Variant B: "A worklist of its own."
 *
 * The Feed is a full page in the main column (what `/notifications` would be),
 * replacing the route content. Day grouping, filter chips per catalogue key,
 * bulk actions, dense rows with the destination spelled out. Treats
 * Notifications as a queue to triage, which is how the catalogue actually
 * reads: seven keys, each with one action.
 *
 * Read/seen: opening the page marks everything SEEN. READ is explicit — click
 * the row to go to its destination, or hit the per-row tick to clear it without
 * leaving. Nothing clears just by scrolling past.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Check, CheckCheck, ArrowRight, Inbox } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import type {
  NotificationKey,
  ProtoFeed,
} from "~/lib/notification-feed.prototype.server";
import {
  keyMeta,
  relativeTime,
  dayLabel,
  useFeedState,
  StateReadout,
} from "./shared";

export const variantName = "A worklist of its own";

export function VariantB({ feed }: { feed: ProtoFeed }) {
  const navigate = useNavigate();
  const {
    entries,
    unreadCount,
    unseenCount,
    markRead,
    markAllSeen,
    markAllRead,
  } = useFeedState(feed);
  const [filter, setFilter] = useState<NotificationKey | "all" | "unread">(
    "all"
  );

  useEffect(() => {
    markAllSeen();
  }, [markAllSeen]);

  const presentKeys = useMemo(
    () => Array.from(new Set(entries.map((e) => e.key))),
    [entries]
  );

  const shown = entries.filter((e) =>
    filter === "all" ? true : filter === "unread" ? !e.readAt : e.key === filter
  );

  const groups = shown.reduce<Record<string, typeof shown>>((acc, entry) => {
    const label = dayLabel(entry.insertedAt);
    (acc[label] ??= []).push(entry);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} unread`
              : "You're all caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <CheckCheck className="size-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ["all", `All ${entries.length}`],
            ["unread", `Unread ${unreadCount}`],
            ...presentKeys.map((k) => [k, keyMeta[k].label] as const),
          ] as [NotificationKey | "all" | "unread", string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === value
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Inbox className="size-8 opacity-40" />
          <span className="text-sm">Nothing here.</span>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(groups).map(([label, rows]) => (
          <section key={label}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </h2>
            <div className="divide-y rounded-lg border bg-card">
              {rows.map((entry) => {
                const meta = keyMeta[entry.key];
                const unread = !entry.readAt;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50",
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
                        navigate(entry.actionUrl);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div
                        className={cn(
                          "truncate text-sm",
                          unread ? "font-semibold" : "text-muted-foreground"
                        )}
                      >
                        {entry.body}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/70">
                        <span>{relativeTime(entry.insertedAt)}</span>
                        <span>·</span>
                        <ArrowRight className="size-3" />
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
          </section>
        ))}
      </div>

      <StateReadout
        className="mt-8"
        total={entries.length}
        unread={unreadCount}
        unseen={unseenCount}
        source={feed.source}
        policy="seen on page open · read on click or per-row tick"
      />
    </div>
  );
}
