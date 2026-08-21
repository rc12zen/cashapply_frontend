/**
 * RoleLegend
 * ============
 * "What each role can see and do" card on the Users page. Mirrors the
 * actual 5-role model enforced by the backend — see
 * backend/scripts/seed_rbac.py, which is the source of truth. Keep these
 * two in sync if the permission matrix ever changes.
 */
import { ShieldCheck, PenSquare, Eye, CheckCircle2, ClipboardList, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Fixed set of exactly 5 roles (mirrors backend/scripts/seed_rbac.py) --
// chipClass is a literal Tailwind arbitrary-value string, not built via
// runtime concatenation, specifically so Tailwind's build-time scanner can
// see and compile it. This replaced separate bg/fg hex fields + an inline
// style={{background, color}} attribute, which strict style-src (no
// 'unsafe-inline') blocks -- these 5 colors never change per-user/per-data,
// so there was no actual need for an inline style here in the first place.
const ROLES: { icon: LucideIcon; name: string; tag: string; description: string; chipClass: string }[] = [
  {
    icon: ShieldCheck, name: "Administrator", tag: "Full access", chipClass: "bg-[#EEECFB] text-[#5A4FCF]",
    description: "No constraints — every page, every action, including managing users and configs.",
  },
  {
    icon: PenSquare, name: "Analyst", tag: "Run + map", chipClass: "bg-[#E4EEFB] text-[#222222]",
    description: "Runs analysis and maps invoices to accounts. Views data everywhere. Cannot approve, reject, or manage config/users.",
  },
  {
    icon: CheckCircle2, name: "Oracle Operator", tag: "Map + approve", chipClass: "bg-[#E4F7EC] text-[#1F9254]",
    description: "Maps invoices and approves or rejects transactions for Oracle posting. Views data everywhere. Cannot run analysis.",
  },
  {
    icon: ClipboardList, name: "Auditor", tag: "Read-only", chipClass: "bg-[#FCF1DE] text-[#B9791A]",
    description: "Views data and the activity log everywhere. Cannot run, map, approve, reject, or manage anything.",
  },
  {
    icon: Eye, name: "Viewer", tag: "Default, no access", chipClass: "bg-[#EEF1F6] text-[#6B7688]",
    description: "Assigned automatically on first sign-in. Restricted to the Welcome page until an administrator assigns a real role.",
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
                className={`w-[38px] h-[38px] min-w-[38px] rounded-xl flex items-center justify-center ${r.chipClass}`}
              >
                <Icon size={17} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-[#222222]">{r.name}</span>
                  <span
                    className={`text-[10.5px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-md ${r.chipClass}`}
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
