"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcTrash } from "./Icons";
import DeletePatientDialog, { type DeletablePatient } from "./DeletePatientDialog";

/**
 * A Delete button for one patient, with the type-the-name confirmation.
 *
 * Shown to the front desk and doctors only for a patient with no consultations
 * (a record registered by mistake), and to clinic admins for anyone. The page
 * decides whether to show it; the server decides whether it works.
 */
export default function DeletePatientButton({
  patient,
  afterHref,
  label = "Delete",
}: {
  patient: DeletablePatient;
  /** Where to go once deleted. Omit to stay and refresh the list. */
  afterHref?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="ghost small danger-btn"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${patient.name}`}
      >
        <IcTrash size={14} /> {label}
      </button>
      {open && (
        <DeletePatientDialog
          patient={patient}
          onClose={() => setOpen(false)}
          onDeleted={() => {
            setOpen(false);
            if (afterHref) router.push(afterHref);
            else router.refresh();
          }}
        />
      )}
    </>
  );
}
