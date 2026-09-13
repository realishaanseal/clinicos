import { redirect } from "next/navigation";

// Settings moved to Clinic admin when accounts arrived. Kept so old bookmarks
// and the address people have learned still land somewhere sensible.
export default function SettingsPage() {
  redirect("/admin");
}
