/**
 * lib/download.ts
 * ================
 * THE single place the app turns data into a file the user downloads.
 *
 * Every page used to hand-roll this: createElement("a") -> href =
 * URL.createObjectURL(blob) -> download = name -> click(). Six copies, each
 * subtly different, and three separate problems between them:
 *
 *  1. Two of them called document.body.appendChild(a) before click(). That is
 *     a leftover from very old Firefox and is not needed in any browser this
 *     app supports -- but it made `appendChild` show up as a DOM-XSS sink in
 *     the security scan (CWE-79). The finding itself was a false positive
 *     (createObjectURL only ever yields an opaque `blob:` URL, the element is
 *     built programmatically, and nothing is parsed as HTML) -- but the line
 *     bought us nothing, so it is gone rather than argued about.
 *
 *  2. Two of them used a filename that came from the SERVER
 *     (preview.filename, remittance.filename -- the latter originating in an
 *     ingested remittance e-mail, i.e. genuinely external). An unsanitised
 *     `download` value enables download spoofing: double extensions, or
 *     bidirectional-override characters that make "invoice.pdf<U+202E>gpj.exe"
 *     render as a harmless-looking PDF. See safeDownloadFilename().
 *
 *  3. revokeObjectURL() was inconsistent: some sites never called it (the
 *     blob leaks for the life of the tab), and some called it immediately,
 *     which races the browser's asynchronous read of the blob and silently
 *     TRUNCATES large downloads. Deferring the revoke, as
 *     FilePreviewPanel had already worked out the hard way, is correct for
 *     every size.
 */

/** Deferred revoke window. Long enough for the browser to finish reading even
 *  a large blob before the URL is released -- see note 3 above. */
const REVOKE_DELAY_MS = 10_000;

/** Characters that must never survive into a `download` attribute:
 *  path separators, C0/C1 control codes, and the Unicode bidirectional
 *  overrides used for extension-spoofing. */
// eslint-disable-next-line no-control-regex
const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|\x00-\x1f\x7f‪-‮⁦-⁩]/g;

/**
 * Reduce an arbitrary (possibly server- or attacker-supplied) string to a
 * plain, safe file name. Never throws; falls back when nothing usable is left.
 */
export function safeDownloadFilename(name: string | null | undefined, fallback: string): string {
  const cleaned = (name ?? "")
    .replace(UNSAFE_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    // Leading dots hide the file on unix-likes; trailing dots/spaces are
    // stripped by Windows anyway and are a classic extension-spoofing trick.
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "")
    .slice(0, 200)
    .trim();
  return cleaned || fallback;
}

/**
 * Save `blob` to the user's machine as `filename`.
 *
 * The anchor is never attached to the document -- click() works on a detached
 * element in every browser this app targets.
 */
export function downloadBlob(blob: Blob, filename: string, fallback = "download"): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeDownloadFilename(filename, fallback);
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** Save raw text (already-built CSV, JSON, ...) with an explicit MIME type. */
export function downloadText(
  text: string,
  filename: string,
  mimeType = "text/csv;charset=utf-8",
): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}

// ─── CSV building ──────────────────────────────────────────────────────────
//
// Spreadsheet software treats a cell beginning with = + - @ (or a leading
// tab/CR) as a FORMULA, not text. A value carried through this app from an
// uploaded statement or a remittance e-mail -- e.g. a customer name of
// =HYPERLINK("http://evil","click me") -- therefore executes when the
// exported CSV is opened. That is CSV / formula injection (CWE-1236); it is
// a distinct issue from XSS, and it is not fixed by quoting alone, because
// Excel strips the quotes before evaluating.

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** A plain number -- "-5", "1234.56", "-1.2e3". These start with "-" or "+"
 *  but cannot be a formula, and this app exports genuinely negative figures
 *  (variance, credit_amount). Prefixing those would turn every negative
 *  amount into TEXT in Excel and break the finance team's own sums, so
 *  numbers are deliberately exempt from the guard below. */
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/**
 * Render one value as a spec-compliant, injection-safe CSV field.
 *
 * - Formula-triggering values are prefixed with a single quote, which Excel
 *   and Sheets both treat as "the rest of this cell is literal text".
 *   Plain numbers are exempt (see PLAIN_NUMBER) -- "-1+cmd|'/c calc'!A0"
 *   is not a plain number, so it is still guarded.
 * - Embedded double quotes are doubled, per RFC 4180. (The old inline
 *   implementations omitted this, so any value containing a quote produced a
 *   structurally broken file.)
 */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  const needsGuard = FORMULA_TRIGGER.test(s) && !PLAIN_NUMBER.test(s);
  const guarded = needsGuard ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Join one row of values into a CSV line. */
export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/**
 * Build a full CSV document from a header list and row objects.
 * `columns` fixes both the order and which keys are exported.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: (keyof T & string)[],
  headers: string[] = columns,
): string {
  return [csvRow(headers), ...rows.map((r) => csvRow(columns.map((c) => r[c])))].join("\n");
}
