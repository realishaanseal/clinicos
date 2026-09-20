"use client";

import { useState } from "react";
import { IcCheck, IcRupee } from "./Icons";

/**
 * The day in one message for whoever owns the clinic (backlog #13): seen,
 * collected, owed, and how many come back tomorrow. Counts and money only —
 * no patient's name, nothing clinical, because it is read on a phone.
 *
 * ClinicOS sends nothing: WhatsApp opens with the message typed in, and the
 * desk presses send there. The words are shown first, so nobody sends
 * something they have not read.
 */
export default function DaySummary({ text, link }: { text: string; link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IcRupee size={16} /> The day in one message
        </span>
        <span className="muted">for whoever runs the clinic</span>
      </div>
      <div className="card-body">
        <pre className="day-summary">{text}</pre>
        <div className="btnrow">
          <a className="wa-link" href={link} target="_blank" rel="noopener noreferrer">
            Send on WhatsApp
          </a>
          <button type="button" className="quiet small" onClick={copy}>
            {copied ? (
              <>
                <IcCheck size={14} /> Copied
              </>
            ) : (
              "Copy"
            )}
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          Nothing is sent by ClinicOS: WhatsApp opens with these words and you press send. No patient is named.
        </p>
      </div>
    </div>
  );
}
