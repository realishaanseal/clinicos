"use client";

import { useEffect, useRef, useState } from "react";
import { useRecorder } from "@/lib/useRecorder";
import { useAutosave, readLocalMirror } from "@/lib/useAutosave";
import { ClinicalNote, Medication, mergeMedicines, noteHasContent } from "@/lib/types";
import Prescription from "./Prescription";
import Favourites from "./Favourites";
import SharePanel, { type ShareState } from "./SharePanel";
import ClinicTermsCard from "./ClinicTerms";
import { WHAT_TO_SAY, type ClinicTerms } from "@/lib/terms";
import type { FavouriteView } from "@/lib/db";
import {
  IcMic, IcRec, IcStop, IcDoc, IcCheck, IcAlert, IcPrint, IcPlus, IcTrash, IcShield,
} from "./Icons";
import { clinicDayAt, fmt, fmtDate, fmtTime, localDay } from "@/lib/time";
import { appPath } from "@/lib/base-path";

type Props = {
  consultId: string;
  patient: { name: string; age: number | null; sex: string | null; phone: string | null; guardianName: string | null };
  initial: {
    hasAudio: boolean;
    transcript: string;
    note: ClinicalNote;
    signedAt: string | null;
    audioDeleted: boolean;
    recovered: boolean;
    workingSavedAt: string | null;
    recordingInterrupted: boolean;
    /** A note is being written by hand: no AI draft, and typing has begun. */
    manual: boolean;
    asrModel: string | null;
    asrSeconds: number | null;
    llmModel: string | null;
    llmSeconds: number | null;
  };
  clinic: {
    name: string; address: string; phone: string;
    doctorName: string; doctorQualification: string; doctorRegNo: string;
  };
  /** The patient's last signed visit, if any. */
  lastVisit: LastVisit | null;
  /** The signed-in doctor's own favourites. */
  favourites: FavouriteView[];
  /** Sharing the signed prescription with the patient (v0.5 Part C). */
  sharing: { share: ShareState; available: boolean; reason: string | null };
  /** Whether the clinic has accepted ClinicOS's terms, which is what lets it
   *  record, and whether this account may accept them for the clinic. */
  recording: { mayRecord: boolean; terms: ClinicTerms | null; canAccept: boolean };
};

type LastVisit = { signedAt: string; diagnosis: string; medications: Medication[] };

// No consent step since 20 Sep 2026: the clinic accepts ClinicOS's terms once,
// and the server refuses to record until it has (lib/terms.ts).
const STEPS = ["Record", "Transcript", "Review & sign"];

export default function ConsultWorkflow({ consultId, patient, initial, clinic, lastVisit, favourites, sharing, recording }: Props) {
  const [mayRecord, setMayRecord] = useState(recording.mayRecord);
  const [transcript, setTranscript] = useState(initial.transcript);
  const [note, setNote] = useState<ClinicalNote>(initial.note);
  const [signedAt, setSignedAt] = useState<string | null>(initial.signedAt);
  const [audioDeleted, setAudioDeleted] = useState(initial.audioDeleted);

  const [haveAudio, setHaveAudio] = useState(initial.hasAudio);
  // Writing the note by hand: a quick visit, a patient who said no to
  // recording, or the AI service being unreachable. Nothing is recorded.
  const [manual, setManual] = useState(initial.manual);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [restored, setRestored] = useState<string | null>(null);
  // Set when the prescription has just been shared: printed on it, this once.
  const [portal, setPortal] = useState<{ address: string; code: string } | null>(null);

  const rec = useRecorder(consultId);
  const save = useAutosave(consultId, !signedAt);
  const [stats, setStats] = useState({
    asrModel: initial.asrModel, asrSeconds: initial.asrSeconds,
    llmModel: initial.llmModel, llmSeconds: initial.llmSeconds,
  });

  const mounted = useRef(false);

  const hasNote = !!(note.chiefComplaint || note.diagnosis || note.history || note.medications.length);
  const step = signedAt ? 3 : hasNote || manual ? 2 : transcript ? 1 : 0;
  const written = noteHasContent(note);

  /* ---------------------------------------------------- recovery on mount */
  useEffect(() => {
    if (signedAt || mounted.current) return;
    mounted.current = true;

    // The server already sent whatever it had. If this browser holds newer
    // work — because the server died while the tab lived — take that instead.
    const local = readLocalMirror(consultId);
    if (!local?.at) return;
    const localTime = new Date(local.at).getTime();
    const serverTime = initial.workingSavedAt ? new Date(initial.workingSavedAt).getTime() : 0;
    if (localTime > serverTime + 1000) {
      if (local.transcript) setTranscript(local.transcript);
      if (local.note) setNote(local.note);
      setRestored(`Restored unsaved work from ${fmtTime(new Date(local.at))}`);
    }
  }, [consultId, initial.workingSavedAt, signedAt]);

  /* --------------------------------------------------------- autosave */
  useEffect(() => {
    if (signedAt || !mounted.current) return;
    save.queue({ transcript, note });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, note, signedAt]);

  /* ------------------------------------- do not let them close mid-work */
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (rec.recording || save.isDirty() || rec.chunksPending > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [rec.recording, rec.chunksPending, save]);

  async function onStop() {
    await rec.stop();
    setHaveAudio(true);
    // The speed pass (#3): transcription starts by itself when recording
    // stops, rather than waiting for a second tap. Not when a transcript is
    // already there — the doctor may have corrected it, and re-transcribing
    // stays a deliberate choice.
    if (!transcript.trim()) await transcribe();
  }

  async function transcribe() {
    setBusy("Transcribing — the first run loads the model, so give it a minute.");
    setError("");
    try {
      const res = await fetch(appPath(`/api/consults/${consultId}/transcribe`), { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTranscript(data.transcript);
      setStats((s) => ({ ...s, asrModel: data.model, asrSeconds: data.seconds }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  async function generateNote() {
    setBusy("Writing the note…");
    setError("");
    try {
      const res = await fetch(appPath(`/api/consults/${consultId}/note`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNote(data.note);
      setStats((s) => ({ ...s, llmModel: data.model, llmSeconds: data.seconds }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  async function sign() {
    setBusy("Signing…");
    setError("");
    try {
      const res = await fetch(appPath(`/api/consults/${consultId}/sign`), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSignedAt(new Date().toISOString());
      setAudioDeleted(!!data.audioDeleted);
      save.clearLocal();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  const set = (k: keyof ClinicalNote) => (v: string) => setNote({ ...note, [k]: v });
  const mm = String(Math.floor(rec.elapsed / 60)).padStart(2, "0");
  const ss = String(rec.elapsed % 60).padStart(2, "0");

  /* ---------------------------------------------------------- signed view */
  if (signedAt) {
    return (
      <>
        <div className="note ok noprint">
          <IcShield size={17} />
          <span>
            Signed {fmt(new Date(signedAt))}.
            {audioDeleted && " The audio recording has been deleted, as promised to the patient."}
          </span>
        </div>
        <div className="btnrow noprint" style={{ marginBottom: 20 }}>
          <button onClick={() => window.print()}><IcPrint size={16} /> Print prescription</button>
          <a href={appPath("/")}><button className="ghost">Back to today</button></a>
        </div>
        <SharePanel
          consultId={consultId}
          hasPhone={!!patient.phone && patient.phone.replace(/\D/g, "").length >= 10}
          initial={sharing.share}
          available={sharing.available}
          unavailableReason={sharing.reason}
          onCode={setPortal}
        />
        <Prescription note={note} patient={patient} clinic={clinic} date={signedAt} visitId={consultId} portal={portal} />
      </>
    );
  }

  return (
    <>
      {!manual && <div className="steps noprint">
        {STEPS.map((label, i) => (
          <div key={label} className={`s ${i < step ? "done" : ""} ${i === step ? "active" : ""}`}>
            <span className="n">{i < step ? <IcCheck size={13} /> : i + 1}</span>
            <span className="l">{label}</span>
          </div>
        ))}
      </div>}

      {restored && (
        <div className="note ok noprint">
          <IcShield size={17} />
          <span>{restored} — nothing was lost.</span>
        </div>
      )}
      {initial.recordingInterrupted && !rec.recording && (
        <div className="note info noprint">
          <IcAlert size={17} />
          <span>
            <strong>This recording was interrupted.</strong> Whatever was captured before the
            interruption is on disk — transcribe it below, or record again to continue.
          </span>
        </div>
      )}
      {(error || rec.error) && (
        <div className="note err noprint">
          <IcAlert size={17} />
          <span>
            {error || rec.error}
            {!manual && !hasNote && (
              <>
                {" "}
                <button className="ghost small" type="button" onClick={() => { setManual(true); setError(""); }} style={{ marginTop: 8 }}>
                  Write the note by hand instead
                </button>
              </>
            )}
          </span>
        </div>
      )}
      {busy && <div className="note ok noprint"><span className="wave"><i style={{ animationDelay: "0s" }} /><i style={{ animationDelay: ".15s" }} /><i style={{ animationDelay: ".3s" }} /></span><span>{busy}</span></div>}

      {lastVisit && !hasNote && !manual && <LastVisitStrip visit={lastVisit} />}

      {manual && (
        <div className="note info noprint">
          <IcDoc size={17} />
          <span style={{ flex: 1 }}>
            <strong>Writing the note by hand.</strong> Nothing is being recorded
            {haveAudio ? ", and the recording already made is still deleted when you sign." : "."}
          </span>
          {!written && (
            <button className="ghost small" type="button" onClick={() => setManual(false)}>
              {mayRecord ? "Record instead" : "Back"}
            </button>
          )}
        </div>
      )}

      {/* ----------------------------------------------------- 1 record */}
      {!manual && !mayRecord && (
        <div className="noprint">
          <ClinicTermsCard
            terms={recording.terms}
            inForce={false}
            canAccept={recording.canAccept}
            onAccepted={() => setMayRecord(true)}
            compact
          />
          <div className="btnrow" style={{ margin: "12px 0 18px" }}>
            <button className="ghost" type="button" onClick={() => setManual(true)}>
              <IcDoc size={16} /> Write the note by hand
            </button>
          </div>
        </div>
      )}
      {!manual && mayRecord && <div className="card flush">
        <div className="card-head">
          <span className="title" style={{ display: "flex", alignItems: "center", gap: 7 }}><IcMic size={15} /> Record the consultation</span>
          {haveAudio && !rec.recording && <span className="pill signed">Audio captured</span>}
        </div>
        <div className="card-body">
          <div className="recorder">
            {!rec.recording ? (
              <button className="rec" onClick={rec.start} disabled={!!busy}>
                <IcRec size={14} /> {haveAudio ? "Record again" : "Start recording"}
              </button>
            ) : (
              <>
                <button className="ghost" onClick={onStop}><IcStop size={14} /> Stop</button>
                <span className="timer"><span className="livedot" />{mm}:{ss}</span>
                <span className="wave">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />
                  ))}
                </span>
                <span className="saveflag">
                  <IcShield size={13} />
                  {rec.uploadedBytes > 0
                    ? `${(rec.uploadedBytes / 1024).toFixed(0)} KB safe on disk`
                    : "saving to disk…"}
                </span>
              </>
            )}
            {haveAudio && !rec.recording && (
              <button onClick={transcribe} disabled={!!busy}><IcDoc size={15} /> Transcribe</button>
            )}
          </div>
          <p className="muted" style={{ marginTop: 13, marginBottom: 0 }}>
            Speak normally — Bengali, Hindi, English or any mix. Audio is saved continuously as you
            talk, so an interruption cannot lose the consultation. It is deleted the moment you sign.
          </p>
          {patient.age !== null && patient.age < 18 && !haveAudio && (
            <div className="note info" style={{ marginTop: 12, marginBottom: 0 }}>
              <IcAlert size={16} />
              <span>
                Under 18: ask their parent or guardian before recording
                {patient.guardianName ? ` (${patient.guardianName} is on record).` : "."}
              </span>
            </div>
          )}
          {!rec.recording && !hasNote && (
            <button className="quiet small" type="button" onClick={() => setManual(true)} style={{ marginTop: 8, marginLeft: -10 }}>
              Patient said no, or no recording needed? Write the note by hand
            </button>
          )}
          {!haveAudio && !rec.recording && (
            <details className="what-to-say">
              <summary>What to tell the patient</summary>
              <p>{WHAT_TO_SAY.en}</p>
              <p lang="bn">{WHAT_TO_SAY.bn}</p>
            </details>
          )}
        </div>
      </div>}

      {/* -------------------------------------------------- 3 transcript */}
      {(manual ? !!transcript : transcript || haveAudio) && (
        <div className="card flush">
          <div className="card-head">
            <span className="title">{manual ? "Transcript, for reference" : "Transcript"}</span>
            {stats.asrModel && (
              <span className="muted mono">{stats.asrModel} · {stats.asrSeconds?.toFixed(1)}s</span>
            )}
          </div>
          <div className="card-body">
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              style={{ minHeight: 150 }}
              placeholder="The transcript appears here. Correct anything obviously misheard before generating the note."
            />
            {!manual && (
              <div className="btnrow" style={{ marginTop: 12 }}>
                <button onClick={generateNote} disabled={!transcript.trim() || !!busy}>
                  <IcDoc size={15} /> Generate clinical note
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- 4 note */}
      {(hasNote || manual) && (
        <NoteEditor
          favourites={favourites}
          lastVisit={lastVisit}
          manual={manual}
          note={note}
          setNote={setNote}
          set={set}
          stats={stats}
          onSign={sign}
          busy={!!busy || !written}
          saveState={save.state}
          savedAt={save.savedAt}
        />
      )}
    </>
  );
}

/** What the patient was last given, as the doctor signed it. The repeat button
 *  appears only inside the note editor, where the medicines can be checked. */
function LastVisitStrip({ visit, onRepeat }: { visit: LastVisit; onRepeat?: () => void }) {
  return (
    <div className="lastvisit noprint">
      <div>
        <span className="k">Last visit, {fmtDate(new Date(visit.signedAt), { day: "numeric", month: "short", year: "numeric" })}</span>
        {visit.diagnosis && <strong> {visit.diagnosis}</strong>}
        <div className="meds-line">
          {visit.medications.length
            ? visit.medications.map((m) => [m.name, m.dose, m.frequency, m.duration].filter(Boolean).join(" ")).join(" · ")
            : "No medicines were prescribed."}
        </div>
      </div>
      {onRepeat && visit.medications.length > 0 && (
        <button className="ghost small" type="button" onClick={onRepeat}>
          <IcPlus size={14} /> Repeat these medicines
        </button>
      )}
    </div>
  );
}

/** The date the doctor asks the patient back (backlog #10). One tap for the
 *  usual intervals, counted from the clinic's today; the date box for anything
 *  else. Printed on the prescription, and on that day the front desk sees the
 *  patient on Follow-ups if they have not been back. */
function FollowUpDate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = localDay();
  const quick: [string, number][] = [["3 days", 3], ["1 week", 7], ["2 weeks", 14], ["1 month", 30]];
  return (
    <div className="field">
      <label htmlFor="followUpOn">Come back on (optional)</label>
      <div className="btnrow">
        <input
          id="followUpOn"
          type="date"
          value={value}
          min={today}
          onChange={(e) => onChange(e.target.value)}
          style={{ maxWidth: 190 }}
        />
        {quick.map(([label, days]) => {
          const day = localDay(clinicDayAt(days));
          return (
            <button key={label} type="button" className={`ghost small ${value === day ? "on" : ""}`} onClick={() => onChange(day)} aria-pressed={value === day}>
              {label}
            </button>
          );
        })}
        {value && (
          <button type="button" className="quiet small" onClick={() => onChange("")}>
            No date
          </button>
        )}
      </div>
      <p className="hint">
        {value
          ? `Printed on the prescription. On ${fmtDate(new Date(`${value}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short" })}, if they haven't been back, the front desk sees them on Follow-ups.`
          : "If you set a date, it is printed on the prescription and the front desk is reminded on that day."}
      </p>
    </div>
  );
}

function NoteEditor({
  favourites, lastVisit, manual, note, setNote, set, stats, onSign, busy, saveState, savedAt,
}: {
  favourites: FavouriteView[];
  lastVisit: LastVisit | null;
  manual: boolean;
  note: ClinicalNote;
  setNote: (n: ClinicalNote) => void;
  set: (k: keyof ClinicalNote) => (v: string) => void;
  stats: { llmModel: string | null; llmSeconds: number | null };
  onSign: () => void;
  busy: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  savedAt: Date | null;
}) {
  function setMed(i: number, field: keyof Medication, value: string) {
    setNote({ ...note, medications: note.medications.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)) });
  }
  const addMed = () =>
    setNote({ ...note, medications: [...note.medications, { name: "", dose: "", frequency: "", duration: "", instructions: "" }] });
  const removeMed = (i: number) =>
    setNote({ ...note, medications: note.medications.filter((_, idx) => idx !== i) });

  // What the last "add from…" button did, said in words: a row appearing at
  // the bottom of the list is easy to miss mid-consultation.
  const [added, setAdded] = useState("");
  function repeatLast() {
    if (!lastVisit) return;
    const { medications, added: n } = mergeMedicines(note.medications, lastVisit.medications);
    setNote({ ...note, medications });
    setAdded(n ? `Added ${n} medicine${n === 1 ? "" : "s"} from the last visit. Check each before signing.` : "Those medicines are already in the list.");
  }

  // The investigations box is one line per test, but the note stores a list.
  // Deriving the box from the list dropped the empty line that Enter creates,
  // so a second test could never be started. The box keeps its own text and
  // only re-reads the list when something else changes it.
  const invList = (text: string) => text.split("\n").filter((s) => s.trim());
  const [invText, setInvText] = useState(() => note.investigations.join("\n"));
  useEffect(() => {
    if (invList(invText).join("\n") !== note.investigations.join("\n")) setInvText(note.investigations.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.investigations]);

  const fields: [keyof ClinicalNote, string][] = [
    ["chiefComplaint", "Chief complaint"],
    ["history", "History"],
    ["examination", "Examination"],
    ["diagnosis", "Diagnosis / impression"],
  ];

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">Review, correct and sign</span>
        <span className="saveflag" data-state={saveState}>
          {saveState === "saving" && "saving…"}
          {saveState === "saved" && (
            <>
              <IcCheck size={12} /> saved {savedAt && fmtTime(savedAt, { hour: "numeric", minute: "2-digit" })}
            </>
          )}
          {saveState === "error" && (
            <>
              <IcAlert size={12} /> kept in this browser — app unreachable
            </>
          )}
          {saveState === "idle" && stats.llmModel && (
            <span className="mono">{stats.llmModel} · {stats.llmSeconds?.toFixed(1)}s</span>
          )}
        </span>
      </div>
      <div className="card-body">
        <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>
          {manual
            ? "Write it as you would on paper. There is no AI draft, so nothing here counts as a correction."
            : "Every correction here is logged. That log is your accuracy metric — correct the draft rather than regenerating it."}
        </p>

        <Favourites initial={favourites} note={note} setNote={setNote} />

        {fields.map(([k, label]) => (
          <div className="field" key={k}>
            <label>{label}</label>
            <textarea value={String(note[k] ?? "")} onChange={(e) => set(k)(e.target.value)} />
          </div>
        ))}

        {lastVisit && <LastVisitStrip visit={lastVisit} onRepeat={repeatLast} />}

        <label style={{ marginTop: 20 }}>Medications</label>
        <div className="meds">
          <div className="med-row hd">
            <span>Drug</span><span>Dose</span><span>Frequency</span><span>Duration</span><span>Instructions</span><span />
          </div>
          {note.medications.length === 0 && (
            <div style={{ padding: "14px 12px", color: "var(--slate-400)", fontSize: 13.5 }}>
              None recorded. Add one only if the doctor actually prescribed it.
            </div>
          )}
          {note.medications.map((m, i) => (
            <div className="med-row" key={i}>
              <input value={m.name} onChange={(e) => setMed(i, "name", e.target.value)} placeholder="Drug name" />
              <input value={m.dose} onChange={(e) => setMed(i, "dose", e.target.value)} placeholder="650mg" />
              <input value={m.frequency} onChange={(e) => setMed(i, "frequency", e.target.value)} placeholder="TDS" />
              <input value={m.duration} onChange={(e) => setMed(i, "duration", e.target.value)} placeholder="3 days" />
              <input value={m.instructions} onChange={(e) => setMed(i, "instructions", e.target.value)} placeholder="After food" />
              <button className="iconbtn" onClick={() => removeMed(i)} title="Remove" type="button">
                <IcTrash size={15} />
              </button>
            </div>
          ))}
        </div>
        <button className="ghost small" onClick={addMed} type="button" style={{ marginTop: 10 }}>
          <IcPlus size={14} /> Add medication
        </button>
        {added && <p className="muted" role="status" style={{ margin: "8px 0 0" }}>{added}</p>}

        <div className="grid" style={{ marginTop: 22 }}>
          <div className="field">
            <label>Investigations — one per line</label>
            <textarea
              value={invText}
              onChange={(e) => {
                setInvText(e.target.value);
                setNote({ ...note, investigations: invList(e.target.value) });
              }}
            />
          </div>
          <div className="field">
            <label>Advice</label>
            <textarea value={note.advice} onChange={(e) => set("advice")(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="followUp">Follow-up</label>
          <input id="followUp" value={note.followUp} onChange={(e) => set("followUp")(e.target.value)} placeholder="Review in 3 days if fever persists" />
        </div>

        <FollowUpDate value={note.followUpOn} onChange={set("followUpOn")} />

        <div className="field">
          <label htmlFor="returnIf">Come back at once if… (optional)</label>
          <textarea
            id="returnIf"
            value={note.returnIf}
            onChange={(e) => set("returnIf")(e.target.value)}
            rows={2}
            placeholder="In your own words, in the patient's language"
          />
          <p className="hint">Printed in a box on the prescription. ClinicOS never fills this in for you.</p>
        </div>

        <div className="note info" style={{ marginTop: 20 }}>
          <IcAlert size={17} />
          <span>
            <strong>Signing is the clinical act.</strong> Nothing above has been checked by anyone but you.{" "}
            {manual
              ? "Signing files the note."
              : "Signing files the note and permanently deletes the audio recording."}
          </span>
        </div>

        <div className="btnrow" style={{ marginTop: 16 }}>
          <button onClick={onSign} disabled={busy}><IcCheck size={16} /> Sign &amp; file</button>
        </div>
      </div>
    </div>
  );
}
