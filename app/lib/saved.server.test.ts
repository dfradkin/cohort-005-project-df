import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./saved.server";
import { MAX_NOTE_LENGTH } from "./saved";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

function addLesson(moduleId: number, title: string, position: number) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get().id;
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonId = addLesson(module.id, "Lesson 1", 1);
  otherLessonId = addLesson(module.id, "Lesson 2", 2);
});

describe("bookmarks", () => {
  it("flags a lesson that had no bookmark, and unflags it when toggled again", () => {
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);

    expect(toggleBookmark(db, base.user.id, lessonId)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonId)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);
  });

  it("never leaves a student with two bookmarks on one lesson", () => {
    toggleBookmark(db, base.user.id, lessonId);
    toggleBookmark(db, base.user.id, lessonId);
    toggleBookmark(db, base.user.id, lessonId);

    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });

  it("refuses a second bookmark on the same lesson at the database level", () => {
    toggleBookmark(db, base.user.id, lessonId);

    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId })
        .run()
    ).toThrow();
  });
});

describe("notes", () => {
  it("creates a note on a lesson that had none", () => {
    const saved = saveNote(db, base.user.id, lessonId, "My first note", NOW);

    expect(saved.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonId)?.body).toBe("My first note");
  });

  it("replaces the body and moves the last-edited time on, keeping createdAt", () => {
    saveNote(db, base.user.id, lessonId, "First draft", NOW);
    saveNote(db, base.user.id, lessonId, "Second draft", LATER);

    const note = getNote(db, base.user.id, lessonId);
    expect(note?.body).toBe("Second draft");
    expect(note?.createdAt).toBe(NOW.toISOString());
    expect(note?.updatedAt).toBe(LATER.toISOString());
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("accepts a note of exactly the cap and refuses one over it", () => {
    const atCap = "a".repeat(MAX_NOTE_LENGTH);
    expect(saveNote(db, base.user.id, lessonId, atCap, NOW).ok).toBe(true);

    const overCap = saveNote(
      db,
      base.user.id,
      lessonId,
      "a".repeat(MAX_NOTE_LENGTH + 1),
      LATER
    );
    expect(overCap.ok).toBe(false);
    expect(getNote(db, base.user.id, lessonId)?.body).toBe(atCap);
  });

  it("refuses an empty note rather than storing or destroying one", () => {
    saveNote(db, base.user.id, lessonId, "Worth keeping", NOW);

    const emptied = saveNote(db, base.user.id, lessonId, "   ", LATER);

    expect(emptied.ok).toBe(false);
    expect(getNote(db, base.user.id, lessonId)?.body).toBe("Worth keeping");
  });

  it("keeps the body as plain text, exactly as it was typed", () => {
    const body = "# not a heading\n*not* bold";
    saveNote(db, base.user.id, lessonId, body, NOW);

    expect(getNote(db, base.user.id, lessonId)?.body).toBe(body);
  });
});

describe("the saved lists", () => {
  it("lists bookmarks newest first, with the lesson and course they belong to", () => {
    saveNote(db, base.user.id, lessonId, "irrelevant", NOW);
    db.insert(schema.bookmarks)
      .values({ userId: base.user.id, lessonId, createdAt: NOW.toISOString() })
      .run();
    db.insert(schema.bookmarks)
      .values({
        userId: base.user.id,
        lessonId: otherLessonId,
        createdAt: LATER.toISOString(),
      })
      .run();

    const saved = listBookmarks(db, base.user.id);

    expect(saved.map((row) => row.lessonTitle)).toEqual([
      "Lesson 2",
      "Lesson 1",
    ]);
    expect(saved[0].courseTitle).toBe("Test Course");
    expect(saved[0].courseSlug).toBe("test-course");
    expect(saved[0].moduleTitle).toBe("Basics");
  });

  it("lists notes most recently edited first", () => {
    saveNote(db, base.user.id, lessonId, "older", NOW);
    saveNote(db, base.user.id, otherLessonId, "newer", LATER);

    expect(listNotes(db, base.user.id).map((row) => row.body)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("shows one student nothing of another student's bookmarks or notes", () => {
    const other = db
      .insert(schema.users)
      .values({
        name: "Other Student",
        email: "other@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();

    toggleBookmark(db, other.id, lessonId);
    saveNote(db, other.id, lessonId, "Someone else's private note", NOW);

    expect(listBookmarks(db, base.user.id)).toEqual([]);
    expect(listNotes(db, base.user.id)).toEqual([]);
    expect(getNote(db, base.user.id, lessonId)).toBeUndefined();
  });

  it("keeps a student's bookmarks and notes when their enrollment ends", () => {
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();

    toggleBookmark(db, base.user.id, lessonId);
    saveNote(db, base.user.id, lessonId, "Written while enrolled", NOW);

    // An approved Refund ends the Enrollment and keeps the rows (ADR 0001).
    db.delete(schema.enrollments)
      .where(eq(schema.enrollments.userId, base.user.id))
      .run();

    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });
});
