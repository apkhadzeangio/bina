// Test-only stand-in for a Cloudflare D1 binding, over Node's built-in SQLite, so the real
// SQL of server/render/store.js runs in the tests. Implements prepare().bind().run/first/all.
import { DatabaseSync } from 'node:sqlite';

export function memoryD1() {
  const db = new DatabaseSync(':memory:');
  return {
    raw: db,
    prepare(sql) {
      let params = [];
      const stmt = {
        bind(...args) {
          params = args;
          return stmt;
        },
        async run() {
          const r = db.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
        async first() {
          return db.prepare(sql).get(...params) ?? null;
        },
        async all() {
          return { success: true, results: db.prepare(sql).all(...params) };
        },
      };
      return stmt;
    },
  };
}
