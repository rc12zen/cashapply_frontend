// lib/configBuilderValidation.ts
// Client-side MIRROR of the backend field-value sanity checks
// (app/bank_statement/account_validation.py + field_sanity.py) so the wizard
// can flag a mis-mapped field LIVE, as the user picks columns, not only after a
// Test round-trip. The backend remains the authoritative gate (it runs over the
// real parsed rows); this is fast feedback on the sample value shown in the UI.
//
// Severity policy matches the backend: account_number failures are "error"
// (block Save/Test unless the user overrides); all other fields are "warn".
import type { FieldWarning, LogicalField } from "./configBuilderTypes";

const MIN_LEN = 6;
const MAX_LEN = 34;

// Distinctive label words (letters/digits only). A genuine account value
// (numeric or IBAN-style) never contains these letter sequences.
const LABEL_TOKENS = [
  "account", "acct", "ibannumber", "sortcode",
  "customername", "customer", "bankname", "narrative", "description",
  "currency", "reference",
];

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeAccount(value: string): string {
  let s = value.trim();
  if (s.endsWith(".0") && /^\d+$/.test(s.slice(0, -2))) s = s.slice(0, -2);
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Mirror of backend account_reject_reason(): reason string, or null if OK. */
export function accountRejectReason(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || ["nan", "none", "nat"].includes(raw.toLowerCase())) {
    return "No account number was provided.";
  }
  const norm = normalizeAccount(raw);
  if (norm.length < MIN_LEN) return `"${raw}" is too short to be an account number (need at least ${MIN_LEN} letters/digits).`;
  if (norm.length > MAX_LEN) return `"${raw}" is too long to be an account number (over ${MAX_LEN} characters).`;
  if (!/\d/.test(norm)) return `"${raw}" has no digits — this looks like a heading or label, not an account number.`;
  const c = compact(raw);
  for (const token of LABEL_TOKENS) {
    if (c.includes(token)) {
      return `"${raw}" contains the label text "${token}" — pick the actual account number, not a heading cell.`;
    }
  }
  return null;
}

const CCY_RE = /^[A-Za-z]{3}$/;
const NUMERIC_LIKE_RE = /^[\d.,\-+\s]+$/;

function parsesAsNumber(s: string): boolean {
  const cleaned = s.replace(/[^\d.\-]/g, "");
  return cleaned !== "" && !Number.isNaN(Number(cleaned));
}

function looksLikeDate(s: string): boolean {
  if (!/\d/.test(s)) return false;                       // no digits → not a date
  if (/^[\d.,\-+\s]+$/.test(s) && s.replace(/\D/g, "").length <= 4) return false; // e.g. a bare amount "1,234"
  const t = s.trim();
  if (/\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}/.test(t)) return true;           // 01/05/2026, 2026-05-01
  if (/\d{1,2}[\/\-\s][A-Za-z]{3,}[\/\-\s]\d{2,4}/.test(t)) return true;    // 01-May-26
  if (/[A-Za-z]{3,}\s+\d{1,2},?\s+\d{2,4}/.test(t)) return true;            // May 1, 2026
  return !Number.isNaN(Date.parse(t));
}

function warn(field: LogicalField, message: string, sample: string): FieldWarning {
  return { field, severity: "warn", message, sample: sample || null };
}

/**
 * Account-number reason over a set of sample values. Only flags when EVERY
 * distinct value fails the structural rule — a genuine account column has real
 * values in every row, whereas a label/metadata cell repeats one bad value
 * (e.g. "Account Number"). Empty set → null (nothing to judge live; the Test /
 * Save gates catch a truly-empty account).
 */
export function accountReasonForSamples(samples: (string | null | undefined)[]): string | null {
  const vals = samples.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (vals.length === 0) return null;
  const distinct = Array.from(new Set(vals));
  const reasons = distinct.map((v) => accountRejectReason(v));
  return reasons.every((r) => r !== null) ? reasons[0] : null;
}

/**
 * Live value check for a field over SEVERAL sample values (the first few real
 * data rows of the chosen column). Majority-based so a single odd cell — or a
 * sub-header value like "Cr" — can't trigger a false warning. account_number is
 * "error" (blocking); the rest are advisory "warn". The backend Test remains
 * the authoritative pass.
 */
export function validateFieldSamples(field: LogicalField, samples: (string | null | undefined)[]): FieldWarning | null {
  if (field === "account_number") {
    const reason = accountReasonForSamples(samples);
    const eg = samples.map((s) => String(s ?? "").trim()).find(Boolean) ?? null;
    return reason ? { field, severity: "error", message: reason, sample: eg } : null;
  }

  const vals = samples.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (vals.length === 0) return null;
  const frac = (pred: (v: string) => boolean) => vals.filter(pred).length / vals.length;
  const eg = vals[0];

  switch (field) {
    case "credit_amount":
      return frac(parsesAsNumber) >= 0.5 ? null
        : warn(field, `Values like "${eg}" don't look numeric — the Credit Amount field may point at the wrong column.`, eg);
    case "currency":
      return frac((v) => CCY_RE.test(v)) >= 0.5 ? null
        : warn(field, `Values like "${eg}" aren't 3-letter currency codes — the Currency field may point at the wrong cell/column.`, eg);
    case "date":
      return frac(looksLikeDate) >= 0.5 ? null
        : warn(field, `Values like "${eg}" don't look like dates — the Date field may point at the wrong column.`, eg);
    case "narrative":
      return frac((v) => NUMERIC_LIKE_RE.test(v)) > 0.5
        ? warn(field, `Values like "${eg}" look numeric — the Narrative field may point at the wrong column.`, eg)
        : null;
    default:
      return null;
  }
}

/** Single-value convenience wrapper around validateFieldSamples. */
export function validateFieldValue(field: LogicalField, sample: string | null | undefined): FieldWarning | null {
  return validateFieldSamples(field, sample == null ? [] : [sample]);
}
