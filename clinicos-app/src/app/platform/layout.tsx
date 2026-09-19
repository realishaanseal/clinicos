import { notFound } from "next/navigation";
import PlatformNav from "@/components/PlatformNav";
import { PLATFORM_ENABLED, getCurrentOperator } from "@/lib/platform";

/** Varaxis's console. Online only: a clinic computer has no platform. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  if (!PLATFORM_ENABLED) notFound();
  const op = await getCurrentOperator();
  if (!op) return <>{children}</>;
  return (
    <div className="shell">
      <PlatformNav name={op.name} />
      <div className="main">{children}</div>
    </div>
  );
}
