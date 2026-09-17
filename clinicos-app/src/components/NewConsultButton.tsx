"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IcPlus } from "./Icons";
import { appPath } from "@/lib/base-path";

export default function NewConsultButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const res = await fetch(appPath("/api/consults"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/consult/${data.consult.id}`);
    else setBusy(false);
  }

  return (
    <button onClick={start} disabled={busy}>
      <IcPlus size={16} /> {busy ? "Starting…" : "New consultation"}
    </button>
  );
}
