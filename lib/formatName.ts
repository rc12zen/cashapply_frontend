/**
 * lib/formatName
 * ==============
 * Shared greeting/identity name formatter used by the home hero and the
 * sidebar. Turns a machine-style identifier (an email local part like
 * "yash.mehetre" or a dotted display_name like "Yash.Mehetre") into a human
 * name ("Yash Mehetre").
 *
 * Deliberately conservative so it can never mangle a name a real SSO
 * provider already formatted:
 *   - a value that already contains a space is assumed human-formatted and
 *     returned untouched (won't flatten intentional casing like "McDonald Ltd");
 *   - otherwise it splits on . _ + (hyphens kept, for hyphenated surnames)
 *     and title-cases each word, but leaves already-mixed-case words alone
 *     so "McDonald" survives.
 *
 * Always returns a string; blank/whitespace/nullish input comes back as "".
 */
export function formatGreetingName(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s || /\s/.test(s)) return s;
  return s
    .split(/[._+]+/)
    .filter(Boolean)
    .map((w) =>
      w === w.toLowerCase() || w === w.toUpperCase()
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w,
    )
    .join(" ");
}
