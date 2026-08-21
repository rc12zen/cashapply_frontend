/**
 * lib/accentColor.ts
 * ===================
 * This app has a small, fixed, hardcoded set of accent colors (metric
 * chips, KPI card accents, chart legend dots) — never user data, never
 * fetched from the API. They used to be applied via inline
 * style={{backgroundColor: hex}}, which strict style-src (no
 * 'unsafe-inline') blocks. Since every actual value is one of these known
 * literals, the real fix is precomputed Tailwind classes, not a runtime
 * workaround — CSP has no nonce mechanism for the style="" attribute
 * anyway, only for <style> elements (see middleware.ts), so this is the
 * correct fix for a genuinely fixed/enumerable set of values, not a
 * shortcut.
 *
 * IMPORTANT: every `case` below returns a LITERAL string constant, not a
 * template-interpolated one — Tailwind's build-time scanner finds classes
 * by looking for literal text matches across source files, not by
 * executing this function. A computed string like `bg-[${hex}]` would
 * silently fail to generate any CSS at all.
 */
export function accentBgClass(hex: string): string {
  switch (hex) {
    case "#090738": return "bg-[#090738]";
    case "#10b981": return "bg-[#10b981]";
    case "#1F9254": return "bg-[#1F9254]";
    case "#222222": return "bg-[#222222]";
    case "#2563EB": return "bg-[#2563EB]";
    case "#6b7280": return "bg-[#6b7280]";
    case "#8A93A6": return "bg-[#8A93A6]";
    case "#C0392B": return "bg-[#C0392B]";
    case "#F0A83C": return "bg-[#F0A83C]";
    case "#dc2626": return "bg-[#dc2626]";
    case "#e11d48": return "bg-[#e11d48]";
    case "#f59e0b": return "bg-[#f59e0b]";
    default: return "bg-gray-300"; // defensive fallback -- should never hit given the fixed set above
  }
}

export function accentBorderClass(hex: string): string {
  switch (hex) {
    case "#090738": return "border-[#090738]";
    case "#10b981": return "border-[#10b981]";
    case "#1F9254": return "border-[#1F9254]";
    case "#222222": return "border-[#222222]";
    case "#2563EB": return "border-[#2563EB]";
    case "#6b7280": return "border-[#6b7280]";
    case "#8A93A6": return "border-[#8A93A6]";
    case "#C0392B": return "border-[#C0392B]";
    case "#F0A83C": return "border-[#F0A83C]";
    case "#dc2626": return "border-[#dc2626]";
    case "#e11d48": return "border-[#e11d48]";
    case "#f59e0b": return "border-[#f59e0b]";
    default: return "border-gray-300";
  }
}
