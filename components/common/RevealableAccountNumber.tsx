"use client";
/**
 * components/common/RevealableAccountNumber.tsx
 * ================================================
 * Renders a masked account number (e.g. "••••1234") with a click-to-reveal
 * toggle. `fetchFull` hits one of the two reveal endpoints in
 * lib/accountReveal.ts, each re-checking the same permission that already
 * gates the underlying record and audit-logging the reveal server-side --
 * this component just makes that a deliberate click instead of something
 * baked into the page load (VAPT remediation). No timer: the revealed value
 * resets naturally when the parent (drawer, dialog, row) unmounts.
 */
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function RevealableAccountNumber({
  masked,
  fetchFull,
  className = "",
}: {
  masked: string;
  fetchFull: () => Promise<string>;
  className?: string;
}) {
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const reveal = async () => {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      setFull(await fetchFull());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 font-mono ${className}`}>
      {full ?? masked}
      <button
        type="button"
        onClick={() => (full ? setFull(null) : reveal())}
        title={full ? "Hide account number" : "Reveal account number"}
        className="text-gray-400 hover:text-gray-600"
      >
        {loading ? (
          <Loader2 size={11} className="animate-spin" />
        ) : full ? (
          <EyeOff size={11} />
        ) : (
          <Eye size={11} />
        )}
      </button>
      {failed && <span className="text-red-500 text-[10px]">couldn&apos;t reveal</span>}
    </span>
  );
}
