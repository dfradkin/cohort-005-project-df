/** PROTOTYPE — THROWAWAY. See app/lib/notification-feed.prototype.server.ts. */
import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  MessageSquare,
  Receipt,
  Shield,
  UserPlus,
  HelpCircle,
} from "lucide-react";
import type {
  NotificationKey,
  ProtoFeed,
  ProtoFeedEntry,
} from "~/lib/notification-feed.prototype.server";

export const keyMeta: Record<
  NotificationKey,
  { label: string; icon: React.ReactNode; tint: string }
> = {
  "refund_request.raised": {
    label: "Refund request",
    icon: <Receipt className="size-4" />,
    tint: "text-amber-600 dark:text-amber-400",
  },
  "refund_request.decided": {
    label: "Refund decision",
    icon: <Receipt className="size-4" />,
    tint: "text-amber-600 dark:text-amber-400",
  },
  "comment.replied": {
    label: "Reply",
    icon: <MessageSquare className="size-4" />,
    tint: "text-blue-600 dark:text-blue-400",
  },
  "question.asked": {
    label: "Question",
    icon: <HelpCircle className="size-4" />,
    tint: "text-violet-600 dark:text-violet-400",
  },
  "seat.claimed": {
    label: "Seat claimed",
    icon: <UserPlus className="size-4" />,
    tint: "text-emerald-600 dark:text-emerald-400",
  },
  "lesson.added": {
    label: "New lesson",
    icon: <BookOpen className="size-4" />,
    tint: "text-sky-600 dark:text-sky-400",
  },
  "course.status_changed": {
    label: "Course status",
    icon: <Shield className="size-4" />,
    tint: "text-rose-600 dark:text-rose-400",
  },
};

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.toDateString() === b.toDateString();
  if (isSameDay(d, today)) return "Today";
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * In-memory read/seen state. No persistence and no real mutation: the question
 * is what the Feed should look like and when a row should stop shouting, not
 * whether Knock's mark-as-read endpoint works. Each variant drives these
 * callbacks on a different trigger, which is the actual thing being compared.
 */
export function useFeedState(initial: ProtoFeed) {
  const [entries, setEntries] = useState<ProtoFeedEntry[]>(initial.entries);

  // Re-seed when the loader hands over a different user's feed.
  useEffect(() => setEntries(initial.entries), [initial.entries]);

  const markRead = useCallback((id: string) => {
    const now = new Date().toISOString();
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, readAt: e.readAt ?? now, seenAt: e.seenAt ?? now }
          : e
      )
    );
  }, []);

  const markAllSeen = useCallback(() => {
    const now = new Date().toISOString();
    setEntries((prev) =>
      prev.map((e) => (e.seenAt ? e : { ...e, seenAt: now }))
    );
  }, []);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        readAt: e.readAt ?? now,
        seenAt: e.seenAt ?? now,
      }))
    );
  }, []);

  const unreadCount = entries.filter((e) => !e.readAt).length;
  const unseenCount = entries.filter((e) => !e.seenAt).length;

  return {
    entries,
    unreadCount,
    unseenCount,
    markRead,
    markAllSeen,
    markAllRead,
  };
}

/** Rule 5: surface the state. Every variant renders this somewhere. */
export function StateReadout({
  total,
  unread,
  unseen,
  source,
  policy,
  className,
}: {
  total: number;
  unread: number;
  unseen: number;
  source: string;
  policy: string;
  className?: string;
}) {
  return (
    <div
      className={`border-t border-dashed px-3 py-2 text-[11px] leading-relaxed text-muted-foreground ${className ?? ""}`}
    >
      <div className="font-mono">
        total {total} · unread {unread} · unseen {unseen}
      </div>
      <div className="mt-0.5">
        <span className="font-semibold">read/seen:</span> {policy}
      </div>
      <div className="opacity-70">source: {source}</div>
    </div>
  );
}
