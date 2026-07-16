/**
 * RoleLegend
 * ============
 * "What each role can see and do" card on the Users page — matches the
 * Users_Page_with_Role_Legend.html reference. Static content: the role set
 * and descriptions are the fixed 5-role model (see backend design doc §7),
 * not fetched — if the role set ever changes, update ROLES below to match.
 */
import { ShieldCheck, PenSquare, Eye, CheckCircle2, ClipboardList, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ROLES: { icon: LucideIcon; name: string; tag: string; description: string; bg: string; fg: string }[] = [
  {
    icon: ShieldCheck, name: "Administrator", tag: "Full access", bg: "#EEECFB", fg: "#5A4FCF",
    description: "Read, write, assigns roles, and manages configs. Only entry deletion is restricted.",
  },
  {
    icon: PenSquare, name: "Analyst", tag: "Run + configure", bg: "#E4EEFB", fg: "#222222",
    description: "Runs analysis, views their own analysis history, and manages configs.",
  },
  {
    icon: Eye, name: "Viewer", tag: "Default, no access", bg: "#EEF1F6", fg: "#6B7688",
    description: "Assigned automatically on onboarding. Must be changed to another role for actual access.",
  },
  {
    icon: CheckCircle2, name: "Oracle approve", tag: "Approve + review", bg: "#E4F7EC", fg: "#1F9254",
    description: "Approves or rejects transactions for Oracle posting, and reviews credit transaction analysis.",
  },
  {
    icon: ClipboardList, name: "Auditor", tag: "Read-only", bg: "#FCF1DE", fg: "#B9791A",
    description: "Views all activity logs. Cannot write or delete anything.",
  },
];

export default function RoleLegend() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-[#8A93A6]" />
          <span className="text-[13px] font-bold tracking-wide text-[#222222] uppercase">Role Legend</span>
        </div>
        <p className="text-[13px] text-[#6B7688] mt-1 ml-[26px]">
          What each role can see and do on CashApply
        </p>
      </div>
      <div className="px-5 py-1">
        {ROLES.map((r, i) => {
          const Icon = r.icon;
          return (
            <div
              key={r.name}
              className={`flex gap-3.5 py-4 ${i < ROLES.length - 1 ? "border-b border-gray-50" : ""}`}
            >
              <div
                className="w-[38px] h-[38px] min-w-[38px] rounded-xl flex items-center justify-center"
                style={{ background: r.bg, color: r.fg }}
              >
                <Icon size={17} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-[#222222]">{r.name}</span>
                  <span
                    className="text-[10.5px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-md"
                    style={{ background: r.bg, color: r.fg }}
                  >
                    {r.tag}
                  </span>
                </div>
                <p className="text-[13px] text-[#6B7688] leading-relaxed m-0">{r.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
