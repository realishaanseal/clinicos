/**
 * Where a consultation's recording lives until the doctor signs.
 *
 * On the clinic computer it is a file in AUDIO_DIR, exactly as before. Online
 * there is no disk that outlives a request, so the same 5-second slices are
 * rows in the AudioChunk table instead. Either way:
 *   - slices are appended as they arrive, so an interrupted recording keeps
 *     everything up to the interruption
 *   - signing deletes the recording, the promise told to every patient (lib/terms.ts)
 *   - deleting a patient deletes it (the rows cascade with the consultation)
 *
 * Consult.audioPath says where it is: a file path, or "db:<consultId>".
 *
 * **Parts.** A recording is made of parts, one per press of Record. Each part
 * is a complete WebM stream with its own header, because the browser starts a
 * fresh MediaRecorder every time. Two of them run onto one another are not one
 * longer recording — whether a decoder reads past the second header is up to
 * the decoder, not something the format promises. ffmpeg, which is what the
 * local sidecar uses, happens to read both (measured 24 Sep 2026); a hosted
 * service's decoder has not been tested and is not ours to assume. Parts are
 * therefore kept apart, transcribed one at a time, and their text joined.
 *
 * Keeping them apart is also what lets transcribing add the new part to what
 * the doctor has on screen instead of doing the whole visit over, which is the
 * bug that was actually reported: a correction came back undone.
 */
import { appendFile, mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { BACKEND, isUniqueViolation, q } from "./sql";

const DB_PREFIX = "db:";

const inDatabase = () => BACKEND === "postgres";

function audioDir() {
  return path.resolve(process.env.AUDIO_DIR || "./data/audio");
}

/** Part 1 keeps the plain name, so a recording made before parts existed — and
 *  Consult.audioPath, which still points at it — is untouched. */
function partPath(basePath: string, part: number) {
  if (part <= 1) return basePath;
  const ext = path.extname(basePath);
  const stem = ext ? basePath.slice(0, -ext.length) : basePath;
  return `${stem}.part${part}${ext}`;
}

async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Parts are numbered from 1 with no gaps, so counting up until one is missing
 *  is enough and costs nothing — a consultation has one or two of them. */
async function filePartCount(basePath: string): Promise<number> {
  if (!(await exists(basePath))) return 0;
  let n = 1;
  while (await exists(partPath(basePath, n + 1))) n++;
  return n;
}

/** How many parts the recording has. 0 when there is no recording. */
export async function partCount(audioPath: string): Promise<number> {
  if (audioPath.startsWith(DB_PREFIX)) {
    const row = await q().get<{ n: number | null }>(
      `SELECT CAST(MAX(part) AS INTEGER) AS n FROM "AudioChunk" WHERE "consultId" = ?`,
      audioPath.slice(DB_PREFIX.length)
    );
    return row?.n ?? 0;
  }
  return filePartCount(audioPath);
}

/**
 * Append one slice of a live recording. `newPart` is set on the first slice
 * after Record is pressed: it starts a new part, rather than running a second
 * WebM stream onto the end of the first.
 *
 * Returns where the recording is and its size so far, across every part.
 */
export async function appendChunk(
  consultId: string,
  buf: Buffer,
  newPart: boolean
): Promise<{ audioPath: string; total: number; part: number }> {
  if (inDatabase()) {
    const storedAt = DB_PREFIX + consultId;
    const highest =
      (
        await q().get<{ n: number | null }>(
          `SELECT CAST(MAX(part) AS INTEGER) AS n FROM "AudioChunk" WHERE "consultId" = ?`,
          consultId
        )
      )?.n ?? 0;
    // Never 0: a slice that arrives without the flag — a re-send after the
    // recording was cleared — still belongs to a part.
    const part = Math.max(1, highest + (newPart ? 1 : 0));

    // The browser sends slices one after another, never two at once, so the
    // next number is always free. The retry covers a slice re-sent after a
    // network error overlapping with its own first attempt.
    for (let attempt = 0; ; attempt++) {
      try {
        await q().run(
          `INSERT INTO "AudioChunk" ("consultId", seq, part, data)
           SELECT ?, CAST(COALESCE(MAX(seq), 0) + 1 AS INTEGER), ?, ? FROM "AudioChunk" WHERE "consultId" = ?`,
          consultId, part, buf, consultId
        );
        break;
      } catch (e) {
        if (!isUniqueViolation(e) || attempt >= 5) throw e;
      }
    }
    return { audioPath: storedAt, total: (await audioBytes(storedAt)) ?? 0, part };
  }

  const dir = audioDir();
  await mkdir(dir, { recursive: true });
  const basePath = path.join(dir, `${consultId}.webm`);
  const have = await filePartCount(basePath);
  const part = newPart ? have + 1 : Math.max(1, have);
  await appendFile(partPath(basePath, part), buf);
  return { audioPath: basePath, total: (await audioBytes(basePath)) ?? 0, part };
}

/** Store a whole recording uploaded in one go, replacing any before it. */
export async function writeWhole(consultId: string, buf: Buffer, ext: string): Promise<string> {
  if (inDatabase()) {
    await q().run(`DELETE FROM "AudioChunk" WHERE "consultId" = ?`, consultId);
    await q().run(`INSERT INTO "AudioChunk" ("consultId", seq, part, data) VALUES (?, 1, 1, ?)`, consultId, buf);
    return DB_PREFIX + consultId;
  }
  const dir = audioDir();
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${consultId}.${ext}`);
  await removeAudio(filePath); // later parts of an earlier recording go too
  await writeFile(filePath, buf);
  return filePath;
}

/**
 * The recording, one decodable buffer per part, in the order they were made.
 * Each carries a filename the transcription service can read the format from.
 */
export async function readParts(
  audioPath: string
): Promise<{ part: number; buf: Buffer; filename: string }[]> {
  if (audioPath.startsWith(DB_PREFIX)) {
    const consultId = audioPath.slice(DB_PREFIX.length);
    const rows = await q().all<{ part: number; data: Buffer | Uint8Array }>(
      `SELECT part, data FROM "AudioChunk" WHERE "consultId" = ? ORDER BY part, seq`,
      consultId
    );
    if (!rows.length) throw new Error("The recording for this consultation is not there any more.");
    const byPart = new Map<number, Buffer[]>();
    for (const r of rows) {
      const n = Number(r.part) || 1;
      if (!byPart.has(n)) byPart.set(n, []);
      byPart.get(n)!.push(Buffer.from(r.data));
    }
    return [...byPart.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([part, bufs]) => ({
        part,
        buf: Buffer.concat(bufs),
        filename: `${consultId}${part > 1 ? `.part${part}` : ""}.webm`,
      }));
  }

  const have = await filePartCount(audioPath);
  if (!have) throw new Error("The recording for this consultation is not there any more.");
  const parts: { part: number; buf: Buffer; filename: string }[] = [];
  for (let n = 1; n <= have; n++) {
    const p = partPath(audioPath, n);
    parts.push({ part: n, buf: await readFile(p), filename: path.basename(p) });
  }
  return parts;
}

export async function audioBytes(audioPath: string): Promise<number | null> {
  if (audioPath.startsWith(DB_PREFIX)) {
    const row = await q().get<{ n: number | null }>(
      `SELECT CAST(SUM(LENGTH(data)) AS INTEGER) AS n FROM "AudioChunk" WHERE "consultId" = ?`,
      audioPath.slice(DB_PREFIX.length)
    );
    return row?.n ?? null;
  }
  const have = await filePartCount(audioPath);
  if (!have) return null;
  let total = 0;
  for (let n = 1; n <= have; n++) {
    try {
      total += (await stat(partPath(audioPath, n))).size;
    } catch {
      /* ignore */
    }
  }
  return total;
}

/** Delete a recording, every part of it. Already gone counts as deleted. */
export async function removeAudio(audioPath: string): Promise<void> {
  if (audioPath.startsWith(DB_PREFIX)) {
    await q().run(`DELETE FROM "AudioChunk" WHERE "consultId" = ?`, audioPath.slice(DB_PREFIX.length));
    return;
  }
  // Count before unlinking anything: removing part 1 first would make
  // filePartCount() stop at zero and leave the rest of the recording on disk
  // after the doctor signed, breaking the promise made to the patient.
  const have = await filePartCount(audioPath);
  for (let n = Math.max(have, 1); n >= 1; n--) {
    try {
      await unlink(partPath(audioPath, n));
    } catch {
      /* already gone */
    }
  }
}
