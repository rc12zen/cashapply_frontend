"use client";
/**
 * app/welcome/page.tsx
 * =======================
 * A dedicated landing page for a signed-in user who hasn't been assigned
 * a role yet (Viewer — see backend scripts/seed_rbac.py, the default role
 * a brand-new SSO/JIT user lands on with zero permissions). Deliberately
 * NOT a card bolted onto the Home dashboard — Home is a working surface
 * for people who already have access; this is a distinct, calmer holding
 * page for people who don't yet.
 *
 * Lets someone check whether access has shown up yet without having to
 * sign out/in again — "Check again" re-fetches /me and, the moment a real
 * role is assigned, takes them straight into the app.
 */
import { CheckCircle2, Clock3, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";
import { isViewerRoles } from "@/lib/permissions";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function WelcomePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("there");
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [stillPending, setStillPending] = useState(false);

  useEffect(() => {
    const cookieEmail = getCookie("login_user_email_stub");
    if (cookieEmail) setDisplayName(cookieEmail.split("@")[0]);

    getMe()
      .then((res) => {
        const data = res.data;
        if (data?.email) setEmail(data.email);
        if (data?.display_name) setDisplayName(data.display_name);
        // If a role has already landed (e.g. this page was reached via a
        // stale bookmark), don't make them click "Check again" themselves.
        if (!isViewerRoles(data?.roles ?? null)) {
          router.replace("/home");
        }
      })
      .catch(() => {});
  }, [router]);

  const handleCheckAgain = async () => {
    setChecking(true);
    setStillPending(false);
    try {
      const res = await getMe();
      if (!isViewerRoles(res.data?.roles ?? null)) {
        router.replace("/home");
        return;
      }
      setStillPending(true);
    } finally {
      setLastCheckedAt(new Date());
      setChecking(false);
    }
  };

  return (
    <div className="relative min-h-full flex items-center justify-center px-4 py-10 overflow-hidden">
      {/* Ambient background — same visual language as the sign-in screen,
          much quieter here (light surface, not a dark panel). */}
      <div className="absolute -top-24 -left-16 w-[380px] h-[380px] rounded-full bg-emerald-500/[0.06] blur-3xl animate-blob pointer-events-none" />
      <div className="absolute -bottom-32 -right-10 w-[380px] h-[380px] rounded-full bg-teal-400/[0.05] blur-3xl animate-blob animate-blob-delay-1 pointer-events-none" />

      <div className="relative w-full max-w-lg">
        <div className="bg-white border border-gray-100 rounded-3xl shadow-sm px-8 py-10 sm:px-10 sm:py-12">
          {/* Status ring */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-[#222222] flex items-center justify-center animate-pulse-ring">
                <Clock3 size={26} className="text-white" />
              </div>
            </div>
          </div>

          <div className="text-center mb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
              Cash Apply
            </p>
            <h1 className="text-2xl font-black text-[#222222] tracking-tight capitalize">
              Welcome, {displayName}.
            </h1>
            <p className="text-sm text-gray-500 mt-2.5 leading-relaxed max-w-sm mx-auto">
              You&apos;re signed in, but your account doesn&apos;t have a role yet — that&apos;s the
              one thing standing between you and the rest of Cash Apply.
            </p>
          </div>

          {/* Progress stepper */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <StepPill icon={<CheckCircle2 size={13} />} label="Signed in" state="done" />
            <StepConnector state="done" />
            <StepPill icon={<Clock3 size={13} />} label="Role assignment" state="current" />
            <StepConnector state="upcoming" />
            <StepPill icon={<ShieldCheck size={13} />} label="Full access" state="upcoming" />
          </div>

          {/* Info card */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <Mail size={13} className="text-gray-400 mt-0.5 shrink-0" />
              <div className="text-[13px]">
                <span className="text-gray-400">Signed in as</span>{" "}
                <span className="font-bold text-[#222222]">{email || "—"}</span>
              </div>
            </div>
            <p className="text-[12px] text-gray-500 leading-relaxed">
              Ask an administrator to assign you a role (Analyst, Oracle Operator, Auditor, or
              Administrator) from the <span className="font-bold text-[#222222]">Users</span> page —
              share the email above so they can find your account.
            </p>
          </div>

          {/* Check again */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              onClick={handleCheckAgain}
              disabled={checking}
              className="flex items-center gap-2 bg-[#222222] hover:bg-black text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
              {checking ? "Checking…" : "Check Access Again"}
            </button>
            {stillPending && (
              <p className="text-[11px] text-amber-600 font-semibold">
                Still no role assigned yet — try again in a bit.
              </p>
            )}
            {lastCheckedAt && !stillPending && (
              <p className="text-[10px] text-gray-300">
                Last checked {lastCheckedAt.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-300 font-bold uppercase tracking-wider mt-5">
          &copy; Zensar Technologies &bull; For Internal Use Only
        </p>
      </div>
    </div>
  );
}

function StepPill({
  icon,
  label,
  state,
}: {
  icon: React.ReactNode;
  label: string;
  state: "done" | "current" | "upcoming";
}) {
  const styles = {
    done: "bg-emerald-50 text-emerald-700 border-emerald-200",
    current: "bg-[#222222] text-white border-[#222222]",
    upcoming: "bg-white text-gray-300 border-gray-200",
  }[state];
  return (
    <div className={`flex items-center gap-1.5 border rounded-full px-2.5 py-1.5 ${styles}`}>
      {icon}
      <span className="text-[9px] font-black uppercase tracking-wider hidden sm:inline whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

function StepConnector({ state }: { state: "done" | "upcoming" }) {
  return <div className={`h-px w-4 sm:w-6 ${state === "done" ? "bg-emerald-300" : "bg-gray-200"}`} />;
}