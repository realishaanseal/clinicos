"use client";

import { IcPrint } from "./Icons";

export default function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()}>
      <IcPrint size={16} /> {label}
    </button>
  );
}
