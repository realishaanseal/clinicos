/**
 * Where a consultation's recording lives until the doctor signs.
 *
 * On the clinic computer it is a file in AUDIO_DIR, exactly as before. Online
 * there is no disk that outlives a request, so the same 5-second slices are
 * rows in the AudioChunk table instead. Either way:
 *   - slices are appended as they arrive, so an interrupted recording keeps
 *     everything up to the interruption
 *   - signing deletes the recording, the promise made in the consent script
 *   - deleting a patient deletes it (the rows cascade with the consultation)
 *
 * Consult.audioPath says where it is: a file path, or "db:<consultId>".
 */
import { appendFile, mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { BACKEND, isUniqueViolation, q } from "./sql";

const DB_PREFIX = "db:";

const inDatabase = () => BACKEND === "postgres";

function audioDir() {
  return path.resolve(process.env.AUDIO_DIR || "./data/audio");
}

/** Append one slice of a live recording. Returns where the recording is and
 *  its size so far. */
export async function appendChunk(consultId: string, buf: Buffer): Promise<{ audioPath: string; total: number }> {
  if (inDatabase()) {
    // The browser sends slices one after another, never two at once, so the
    // next number is always free. The retry covers a slice re-sent after a
    // network error overlapping with its own first attempt.
    for (let attempt = 0; ; attempt++) {
      try {
        await q().run(
          `INSERT INTO "AudioChunk" ("consultId", seq, data)
           SELECT ?, CAST(COALESCE(MAX(seq), 0) + 1 AS INTEGER), ? FROM "AudioChunk" WHERE "consultId" = ?`,
          consultId, buf, consultId
        );
        break;
      } catch (e) {
        if (!isUniqueViolation(e) || attempt >= 5) throw e;
      }
    }
    return { audioPath: DB_PREFIX + consultId, total: (await audioBytes(DB_PREFIX + consultId)) ?? 0 };
  }

  const dir = audioDir();
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${consultId}.webm`);
  await appendFile(filePath, buf);
  let total = 0;
  try {
    total = (await stat(filePath)).size;
  } catch {
    /* ignore */
  }
  return { audioPath: filePath, total };
}

/** Store a whole recording uploaded in one go, replacing any before it. */
export async function writeWhole(consultId: string, buf: Buffer, ext: string): Promise<string> {
  if (inDatabase()) {
    await q().run(`DELETE FROM "AudioChunk" WHERE "consultId" = ?`, consultId);
    await q().run(`INSERT INTO "AudioChunk" ("consultId", seq, data) VALUES (?, 1, ?)`, consultId, buf);
    return DB_PREFIX + consultId;
  }
  const dir = audioDir();
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${consultId}.${ext}`);
  await writeFile(filePath, buf);
  return filePath;
}

/** The recording as one buffer, and a filename the transcription service can
 *  read the format from. */
export async function readAudio(audioPath: string): Promise<{ buf: Buffer; filename: string }> {
  if (audioPath.startsWith(DB_PREFIX)) {
    const consultId = audioPath.slice(DB_PREFIX.length);
    const rows = await q().all<{ data: Buffer | Uint8Array }>(
      `SELECT data FROM "AudioChunk" WHERE "consultId" = ? ORDER BY seq`,
      consultId
    );
    if (!rows.length) throw new Error("The recording for this consultation is not there any more.");
    return { buf: Buffer.concat(rows.map((r) => Buffer.from(r.data))), filename: `${consultId}.webm` };
  }
  return { buf: await readFile(audioPath), filename: path.basename(audioPath) };
}

export async function audioBytes(audioPath: string): Promise<number | null> {
  if (audioPath.startsWith(DB_PREFIX)) {
    const row = await q().get<{ n: number | null }>(
      `SELECT CAST(SUM(LENGTH(data)) AS INTEGER) AS n FROM "AudioChunk" WHERE "consultId" = ?`,
      audioPath.slice(DB_PREFIX.length)
    );
    return row?.n ?? null;
  }
  try {
    return (await stat(audioPath)).size;
  } catch {
    return null;
  }
}

/** Delete a recording. Already gone counts as deleted. */
export async function removeAudio(audioPath: string): Promise<void> {
  if (audioPath.startsWith(DB_PREFIX)) {
    await q().run(`DELETE FROM "AudioChunk" WHERE "consultId" = ?`, audioPath.slice(DB_PREFIX.length));
    return;
  }
  try {
    await unlink(audioPath);
  } catch {
    /* already gone */
  }
}
