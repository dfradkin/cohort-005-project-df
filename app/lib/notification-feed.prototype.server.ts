/**
 * PROTOTYPE — THROWAWAY. Lives on branch `prototype/notification-feed` only.
 *
 * Question it answers (ticket #17): what does the Notification Feed look like
 * in Cadence? Three variants of the Feed, switchable via `?variant=A|B|C`,
 * mounted on the real app layout so they butt up against the real sidebar and
 * real data. No tests, no error handling beyond what keeps it runnable.
 *
 * Data, in order of preference:
 *   1. The REAL Knock in-app feed for the current user, read server-side here
 *      and handed to the route as plain data — the map's Notes require the Feed
 *      UI to read through our own loader and never call the Knock SDK from a
 *      route, so the prototype obeys that from the start.
 *   2. Catalogue fixtures composed from real database rows, when Knock's feed
 *      is empty. The Knock account has no committed workflows yet (a trigger
 *      404s with `workflow_missing`), so today this is the path that renders.
 *
 * Both paths produce the same shape, so the UI can't tell them apart and the
 * swap to real entries is a no-op.
 */

import { desc, eq, ne } from "drizzle-orm";
import { db } from "~/db";
import { courses, lessons, modules, users, UserRole } from "~/db/schema";

/** The seven catalogue keys, from ticket #13. */
export type NotificationKey =
  | "refund_request.raised"
  | "refund_request.decided"
  | "comment.replied"
  | "question.asked"
  | "seat.claimed"
  | "lesson.added"
  | "course.status_changed";

/**
 * One row in the Feed. A deliberate subset of Knock's in-app feed entry: the
 * catalogue gives each Notification one line of copy and exactly one
 * destination, so a row needs no more than this.
 */
export interface ProtoFeedEntry {
  id: string;
  key: NotificationKey;
  /** The one line of copy. */
  body: string;
  /** The single in-app destination. */
  actionUrl: string;
  actor: { name: string; avatarUrl: string | null } | null;
  insertedAt: string;
  /** Knock's two-axis read model: seen = it appeared in front of you. */
  seenAt: string | null;
  /** read = you engaged with it. */
  readAt: string | null;
}

export interface ProtoFeed {
  entries: ProtoFeedEntry[];
  meta: { totalCount: number; unreadCount: number; unseenCount: number };
  source: "knock" | "database-fixture";
  /** Shown in the prototype switcher so the viewer knows what they're looking at. */
  note: string;
}

const KNOCK_API = "https://api.knock.app";

interface KnockBlock {
  name: string;
  rendered?: string;
  content?: string;
}

interface KnockEntry {
  id: string;
  inserted_at: string;
  seen_at: string | null;
  read_at: string | null;
  blocks?: KnockBlock[];
  actors?: { name?: string; avatar?: string | null }[];
  data?: Record<string, unknown>;
  source?: { key?: string };
}

/**
 * Reads the real in-app feed. Public key + channel id is all this endpoint
 * needs while Knock's enhanced security mode is off (ticket #15); once it's on,
 * this call grows a signed user token and nothing else about the UI changes.
 */
async function readKnockFeed(userId: number): Promise<ProtoFeed | null> {
  const publicKey = process.env.KNOCK_PUBLIC_API_KEY;
  const channelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!publicKey || !channelId) return null;

  try {
    const res = await fetch(
      `${KNOCK_API}/v1/users/${userId}/feeds/${channelId}?page_size=25`,
      {
        headers: { Authorization: `Bearer ${publicKey}` },
        signal: AbortSignal.timeout(2500),
      }
    );
    if (!res.ok) return null;

    const json = (await res.json()) as {
      entries?: KnockEntry[];
      meta?: {
        total_count?: number;
        unread_count?: number;
        unseen_count?: number;
      };
    };

    const entries = (json.entries ?? []).map((entry): ProtoFeedEntry => {
      const block = (name: string) =>
        entry.blocks?.find((b) => b.name === name)?.rendered ??
        entry.blocks?.find((b) => b.name === name)?.content ??
        "";
      const actor = entry.actors?.[0];
      return {
        id: entry.id,
        key: (entry.source?.key ?? "comment.replied") as NotificationKey,
        body: block("body") || String(entry.data?.body ?? ""),
        actionUrl: block("action_url") || String(entry.data?.action_url ?? "/"),
        actor: actor?.name
          ? { name: actor.name, avatarUrl: actor.avatar ?? null }
          : null,
        insertedAt: entry.inserted_at,
        seenAt: entry.seen_at,
        readAt: entry.read_at,
      };
    });

    if (entries.length === 0) return null;

    return {
      entries,
      meta: {
        totalCount: json.meta?.total_count ?? entries.length,
        unreadCount: json.meta?.unread_count ?? 0,
        unseenCount: json.meta?.unseen_count ?? 0,
      },
      source: "knock",
      note: "Live Knock feed",
    };
  } catch {
    return null;
  }
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * Composes catalogue Notifications out of real rows, so the Feed carries real
 * course titles, real lesson titles and real people. Role-aware: the catalogue
 * sends different Notifications to each role, and that asymmetry is half of
 * what the design has to survive. Switch user in the DevUI panel to see it.
 */
function composeFixtureFeed(
  userId: number,
  role: UserRole | null,
  isTeamAdmin: boolean
): ProtoFeed {
  const others = db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(ne(users.id, userId))
    .limit(8)
    .all();

  const lessonRows = db
    .select({
      lessonTitle: lessons.title,
      lessonId: lessons.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      courseId: courses.id,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .orderBy(desc(lessons.id))
    .limit(8)
    .all();

  const ownCourses = db
    .select({ id: courses.id, title: courses.title, slug: courses.slug })
    .from(courses)
    .where(eq(courses.instructorId, userId))
    .limit(4)
    .all();

  const person = (i: number) =>
    others[i % Math.max(others.length, 1)] ?? {
      id: 0,
      name: "Someone",
      avatarUrl: null,
    };
  const place = (i: number) =>
    lessonRows[i % Math.max(lessonRows.length, 1)] ?? {
      lessonTitle: "a lesson",
      lessonId: 1,
      courseTitle: "a course",
      courseSlug: "course",
      courseId: 1,
    };

  const out: ProtoFeedEntry[] = [];
  let n = 0;
  const push = (
    e: Omit<ProtoFeedEntry, "id" | "insertedAt"> & { minutes: number }
  ) => {
    const { minutes, ...rest } = e;
    out.push({ ...rest, id: `fixture-${++n}`, insertedAt: minutesAgo(minutes) });
  };

  if (role === UserRole.Admin) {
    // A Platform Admin's whole catalogue is one key, fanned out per Admin with
    // its own read state, and never coalesced: three buyers, three rows.
    [0, 1, 2].forEach((i) => {
      const buyer = person(i);
      const course = place(i);
      push({
        key: "refund_request.raised",
        body: `${buyer.name} asked for a refund on ${course.courseTitle}`,
        actionUrl: "/admin/refunds",
        actor: { name: buyer.name, avatarUrl: buyer.avatarUrl },
        seenAt: i === 0 ? null : minutesAgo(30),
        readAt: i === 2 ? minutesAgo(25) : null,
        minutes: [7, 48, 300][i]!,
      });
    });
  } else if (role === UserRole.Instructor) {
    const course = ownCourses[0] ?? {
      id: place(0).courseId,
      title: place(0).courseTitle,
      slug: place(0).courseSlug,
    };
    [0, 1].forEach((i) => {
      const asker = person(i);
      const p = place(i);
      push({
        key: "question.asked",
        body: `${asker.name} asked a question on ${p.lessonTitle}`,
        actionUrl: "/instructor/questions",
        actor: { name: asker.name, avatarUrl: asker.avatarUrl },
        seenAt: i === 0 ? null : minutesAgo(90),
        readAt: null,
        minutes: [12, 140][i]!,
      });
    });
    push({
      key: "course.status_changed",
      body: `${course.title} was published by Cadence staff`,
      actionUrl: `/instructor/${course.id}`,
      actor: null,
      seenAt: minutesAgo(200),
      readAt: null,
      minutes: 420,
    });
    const replier = person(3);
    push({
      key: "comment.replied",
      body: `${replier.name} replied to your comment on ${place(2).lessonTitle}`,
      actionUrl: `/courses/${place(2).courseSlug}/lessons/${place(2).lessonId}`,
      actor: { name: replier.name, avatarUrl: replier.avatarUrl },
      seenAt: minutesAgo(1500),
      readAt: minutesAgo(1480),
      minutes: 1600,
    });
  } else {
    // Student (and the Team Admin extras below).
    const p0 = place(0);
    push({
      key: "lesson.added",
      body: `New lesson in ${p0.courseTitle}: ${p0.lessonTitle}`,
      actionUrl: `/courses/${p0.courseSlug}/lessons/${p0.lessonId}`,
      actor: null,
      seenAt: null,
      readAt: null,
      minutes: 4,
    });
    const replier = person(0);
    const p1 = place(1);
    push({
      key: "comment.replied",
      body: `${replier.name} replied to your comment on ${p1.lessonTitle}`,
      actionUrl: `/courses/${p1.courseSlug}/lessons/${p1.lessonId}`,
      actor: { name: replier.name, avatarUrl: replier.avatarUrl },
      seenAt: null,
      readAt: null,
      minutes: 55,
    });
    push({
      key: "refund_request.decided",
      body: `Your refund request for ${place(2).courseTitle} was declined`,
      actionUrl: `/courses/${place(2).courseSlug}`,
      actor: null,
      seenAt: minutesAgo(600),
      readAt: null,
      minutes: 1440,
    });
    const p3 = place(3);
    push({
      key: "lesson.added",
      body: `New lesson in ${p3.courseTitle}: ${p3.lessonTitle}`,
      actionUrl: `/courses/${p3.courseSlug}/lessons/${p3.lessonId}`,
      actor: null,
      seenAt: minutesAgo(3000),
      readAt: minutesAgo(2990),
      minutes: 4320,
    });
  }

  if (isTeamAdmin) {
    // v1 does no coalescing, so a busy afternoon of Seat claims is a run of
    // near-identical rows. Worth seeing in the design, not hiding from it.
    [0, 1, 2].forEach((i) => {
      const claimer = person(i + 2);
      const course = place(i + 1);
      push({
        key: "seat.claimed",
        body: `${claimer.name} claimed a seat on ${course.courseTitle}`,
        actionUrl: "/team",
        actor: { name: claimer.name, avatarUrl: claimer.avatarUrl },
        seenAt: null,
        readAt: null,
        minutes: [18, 22, 26][i]!,
      });
    });
  }

  const entries = out.sort((a, b) => b.insertedAt.localeCompare(a.insertedAt));

  return {
    entries,
    meta: {
      totalCount: entries.length,
      unreadCount: entries.filter((e) => !e.readAt).length,
      unseenCount: entries.filter((e) => !e.seenAt).length,
    },
    source: "database-fixture",
    note: "Catalogue fixtures from the local database (Knock has no committed workflows yet)",
  };
}

export async function loadNotificationFeedPrototype({
  userId,
  role,
  isTeamAdmin,
}: {
  userId: number | null;
  role: UserRole | null;
  isTeamAdmin: boolean;
}): Promise<ProtoFeed> {
  if (!userId) {
    return {
      entries: [],
      meta: { totalCount: 0, unreadCount: 0, unseenCount: 0 },
      source: "database-fixture",
      note: "No user selected — pick one in the DevUI panel",
    };
  }

  return (
    (await readKnockFeed(userId)) ??
    composeFixtureFeed(userId, role, isTeamAdmin)
  );
}
