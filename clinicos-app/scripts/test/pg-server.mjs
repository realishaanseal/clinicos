// A throwaway Postgres for the online test run: PGlite (Postgres compiled to
// WebAssembly) behind a real socket, so nothing needs installing.
//
//   node scripts/test/pg-server.mjs <port> [data-folder]
//
// In memory unless a folder is given; the sandbox gives one so its clinics
// survive a restart. Prints "ready" once it accepts connections, and runs until
// killed.
//
// PGlite is one connection underneath. The server shares it between clients
// and, while one client has a transaction open, runs only that client's
// queries — so transactions behave, but nothing truly runs in parallel. The
// tests that race two requests therefore prove correctness here, not the
// behaviour under real concurrency; that is checked against Supabase itself.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.argv[2] || 55432);
const dataDir = process.argv[3];
const db = await PGlite.create(dataDir ? { dataDir } : undefined);
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 50 });
await server.start();
console.log("ready");

const stop = async () => {
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
