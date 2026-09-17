// Direct looks at the test database, for checks that cannot be made over HTTP.
// The same calls work whether the app under test runs on SQLite or Postgres:
//
//   const db = peek(dbPath);          // dbPath is ignored on Postgres
//   const row = await db.get(`SELECT "id" FROM "User" WHERE "username" = ?`, "owner");
//   await db.close();
//
// Write the SQL the way src/lib/sql.ts describes: quoted identifiers, `?`
// placeholders, CAST(COUNT(*) AS INTEGER).
const ONLINE = (process.env.DATA_BACKEND || "").toLowerCase() === "postgres";

function numbered(sql) {
  let n = 0;
  let quote = null;
  let out = "";
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
      out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else out += ch === "?" ? `$${++n}` : ch;
  }
  return out;
}

function peek(dbPath) {
  if (ONLINE) {
    const postgres = require("postgres");
    const url = process.env.DATABASE_URL;
    const sql = postgres(url, { prepare: false, ssl: /sslmode=disable/.test(url) ? false : "require", max: 1 });
    const run = (text, params) => sql.unsafe(numbered(text), params);
    return {
      online: true,
      all: async (text, ...params) => [...(await run(text, params))],
      get: async (text, ...params) => (await run(text, params))[0],
      run: async (text, ...params) => ({ changes: (await run(text, params)).count }),
      tables: async () =>
        (await sql`select table_name from information_schema.tables where table_schema = 'public'`).map((r) => r.table_name),
      close: () => sql.end({ timeout: 5 }),
    };
  }
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  return {
    online: false,
    all: async (text, ...params) => db.prepare(text).all(...params),
    get: async (text, ...params) => db.prepare(text).get(...params),
    run: async (text, ...params) => ({ changes: db.prepare(text).run(...params).changes }),
    tables: async () => db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name),
    close: async () => db.close(),
  };
}

module.exports = { peek, ONLINE };
