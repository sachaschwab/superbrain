import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DATA_DIR, DB_PATH, MIGRATIONS_DIR } from '../paths';
import * as schema from './schema';
import { loadCurriculum } from '../curriculum';

export type DB = BetterSQLite3Database<typeof schema>;
export { schema };

const g = globalThis as unknown as { __superbrainDb?: { db: DB; sqlite: Database.Database } };

/** Open (or reuse) the database, apply migrations and sync the curriculum. */
export function getDb(): DB {
  if (g.__superbrainDb) return g.__superbrainDb.db;
  mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  syncCurriculum(db);
  g.__superbrainDb = { db, sqlite };
  return db;
}

export function closeDb() {
  g.__superbrainDb?.sqlite.close();
  g.__superbrainDb = undefined;
}

/** Upsert lessons, vocabulary and grammar from the version-controlled JSON. */
export function syncCurriculum(db: DB) {
  const curriculum = loadCurriculum();
  db.transaction((tx) => {
    for (const l of curriculum.lessons) {
      const row = { id: l.id, number: l.number, title: l.title, curriculumJson: JSON.stringify(l), updatedAt: new Date() };
      tx.insert(schema.lessons).values(row).onConflictDoUpdate({ target: schema.lessons.id, set: row }).run();
      for (const v of l.vocabularyTargets) {
        const vr = { id: v.id, japanese: v.japanese, reading: v.reading, english: v.english, firstLessonId: l.id };
        tx.insert(schema.vocabularyItems).values(vr).onConflictDoUpdate({ target: schema.vocabularyItems.id, set: vr }).run();
      }
      for (const gp of l.grammarTargets) {
        const gr = { id: gp.id, name: gp.name, explanation: gp.explanation, firstLessonId: l.id };
        tx.insert(schema.grammarPatterns).values(gr).onConflictDoUpdate({ target: schema.grammarPatterns.id, set: gr }).run();
      }
    }
  });
}
