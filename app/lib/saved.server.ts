import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";
import { MAX_NOTE_LENGTH } from "~/lib/saved";

// ─── Bookmarks and Notes ───
// What a Student attaches to a Lesson for themselves and nobody else: a
// Bookmark (a flag on the Lesson) and a Note (their own writing about it).
// See GLOSSARY.md for the language.
//
// A Note is private to the Student who wrote it. Nothing outside that
// Student's own Lesson page and Saved page may read a Note body — no
// Instructor view, no Platform Admin view.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;

type Note = typeof notes.$inferSelect;

/** The Lesson a saved row points at, with the names needed to label it. */
interface SavedLesson {
  lessonId: number;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  courseSlug: string;
}

export interface SavedBookmark extends SavedLesson {
  id: number;
  createdAt: string;
}

export interface SavedNote extends SavedLesson {
  id: number;
  body: string;
  updatedAt: string;
}

const savedLessonColumns = {
  lessonId: lessons.id,
  lessonTitle: lessons.title,
  moduleTitle: modules.title,
  courseTitle: courses.title,
  courseSlug: courses.slug,
};

function getBookmark(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .get();
}

/** Whether this Student has flagged this Lesson. */
export function isBookmarked(db: Db, userId: number, lessonId: number) {
  return !!getBookmark(db, userId, lessonId);
}

/**
 * Adds the Student's Bookmark on the Lesson, or removes it when one is
 * already there. Returns whether the Lesson is bookmarked afterwards.
 */
export function toggleBookmark(db: Db, userId: number, lessonId: number) {
  const existing = getBookmark(db, userId, lessonId);

  if (existing) {
    db.delete(bookmarks).where(eq(bookmarks.id, existing.id)).run();
    return false;
  }

  db.insert(bookmarks).values({ userId, lessonId }).run();
  return true;
}

/** The Student's own Note on the Lesson, if they have written one. */
export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult = { ok: true; note: Note } | { ok: false; error: string };

/**
 * Writes the Student's Note on the Lesson. Saving again replaces the body and
 * moves `updatedAt` on; `createdAt` stays put. The body is plain text,
 * trimmed, and refused rather than truncated when it is over the cap.
 */
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "A note cannot be empty." };
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      error: `A note cannot be longer than ${MAX_NOTE_LENGTH} characters.`,
    };
  }

  const timestamp = now.toISOString();
  const existing = getNote(db, userId, lessonId);

  if (existing) {
    const updated = db
      .update(notes)
      .set({ body: trimmed, updatedAt: timestamp })
      .where(eq(notes.id, existing.id))
      .returning()
      .get();
    return { ok: true, note: updated };
  }

  const created = db
    .insert(notes)
    .values({
      userId,
      lessonId,
      body: trimmed,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
    .get();
  return { ok: true, note: created };
}

/** This Student's Bookmarks, newest first, labelled with their Lesson. */
export function listBookmarks(db: Db, userId: number): SavedBookmark[] {
  return db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      ...savedLessonColumns,
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(bookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt))
    .all();
}

/** This Student's Notes, most recently edited first, labelled with their Lesson. */
export function listNotes(db: Db, userId: number): SavedNote[] {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      ...savedLessonColumns,
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .all();
}
