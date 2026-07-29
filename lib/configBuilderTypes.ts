// lib/configBuilderTypes.ts
// Types for the Bank Data Ingestion Layer — Config Builder wizard, resolve &
// management dialogs. Kept separate from lib/types.ts so the ingestion layer
// can be integrated as a self-contained unit.

export interface RawPreviewSheet {
  name: string;
  rows: string[][];
}

export interface RawPreviewData {
  filename: string;
  storage_key: string;
  extension: string;
  sheets: RawPreviewSheet[];
}

export type LogicalField =
  | "account_number"
  | "currency"
  | "bank_name"
  | "date"
  | "narrative"
  | "credit_amount"
  | "bank_reference";

export type FieldSourceType = "column" | "cell" | "fixed" | "concat" | "none";

export interface FieldSource {
  type: FieldSourceType;
  // column
  name?: string | null;
  // cell
  row?: number;
  col?: number;
  // fixed
  value?: string;
  // concat
  names?: string[];
  sep?: string;
}

export interface MergeRule {
  sub_value: string;
  rename_parent_to: string;
}

export interface CreditRuleConfig {
  type: "column_not_blank" | "amount_positive" | "flag_matches";
  field: string;
  pattern?: string;
}

export interface ExclusionRule {
  type: "field_value_in" | "field_not_equals" | "field_blank" | "field_matches";
  field: string;
  values?: string[];
  value?: string;
  pattern?: string;
}

export interface BuilderTestRow {
  bank_name: string;
  account_number: string;
  currency: string;
  narrative: string;
  credit_amount: number;
  statement_date: string | null;
  bank_reference: string | null;
}

// A value-level sanity finding from the backend field checks (or the live
// client-side mirror). `field` is a LogicalField; account_number failures are
// "error" (blocking), everything else is "warn".
export interface FieldWarning {
  field: string;
  severity: "error" | "warn";
  message: string;
  sample?: string | null;
}

export interface BuilderTestResult {
  success: boolean;
  row_count: number;
  rows: BuilderTestRow[];
  error?: string;
  // Value-level sanity checks over the parsed rows (additive — older backends
  // omit these; treat missing as "no findings" / account_ok = true).
  warnings?: FieldWarning[];
  account_ok?: boolean;
}

export interface BuilderSaveResult {
  success: boolean;
  config_key: string;
  message: string;
  // One entry per account configured by this save (multi-account fan-out).
  saved?: {
    account_number: string; display_name: string; created: boolean;
    format_created: boolean; version: number; ou_number: string; business_unit: string;
  }[];
  // Already-configured accounts whose OU this save moved — reported so a
  // reassignment across N accounts is never silent.
  ou_changed?: { account_number: string; from_ou_number: string | null; to_ou_number: string }[];
}

// ── Account-based model ────────────────────────────────────────────────────────

export type AccountLocatorType = "cell" | "column" | "regex";

export interface AccountLocator {
  type: AccountLocatorType;
  // cell
  sheet?: string;
  row?: number;
  col?: number;
  // column
  name?: string;
  // regex
  pattern?: string;
  in?: { type: "cell" | "column" | "sheet"; row?: number; col?: number; name?: string };
}

// A cell that names several accounts ("41678876 & 41678884"). `key` is the
// backend's alias_key (sorted tokens joined by "|") and is what the recipe's
// account_aliases map is keyed on. `chosen` is the primary the user picked, if any.
export interface MixedAccountCell {
  key: string;
  accounts: string[];
  chosen?: string | null;
}

// Details already on record for a discovered account — used to prefill the
// per-account OU table so onboarding N accounts is mostly confirming.
export interface KnownAccountInfo {
  display_name?: string | null;
  bank?: string | null;
  currency?: string | null;
  ou_number?: string | null;
  business_unit?: string | null;
}

export interface LocateAccountResult {
  accounts: string[];
  count: number;
  last4s: string[];
  existing: Record<string, string[]>;   // account -> formats already configured
  // account -> reason string when the value doesn't look like a real account
  // (label/heading cell, no digits, wrong length), else null. Additive.
  account_issues?: Record<string, string | null>;
  // Total discovered before the display cap, and how many were NOT returned.
  // truncated > 0 must be surfaced — a silently-shortened list reads as complete.
  total_found?: number;
  truncated?: number;
  // Cells naming 2+ accounts; each needs a primary chosen before saving.
  mixed?: MixedAccountCell[];
  known?: Record<string, KnownAccountInfo>;
}

// One account to onboard against the recipe being saved. A COLUMN locator finds
// several accounts in one file; each gets its own BankAccount + OU but shares the
// SAME recipe body. Mirrors the backend's AccountAssignment.
export interface AccountAssignment {
  account_number: string;
  display_name: string;
  ou_number: string;
  business_unit: string;
  functional_currency?: string;
  bank?: string;
  currency?: string;
  override_account_validation?: boolean;
}

export interface SaveRecipePayload {
  account_number: string;
  display_name: string;
  format: string;                        // xlsx | xls | csv | pdf
  recipe: object;                        // account_locator + source + fields + credit_rule + …
  bank?: string;
  currency?: string;
  ou_number: string;
  business_unit: string;
  // Ledger/functional currency for this OU — only used if ou_number is
  // genuinely new (see backend's builder_save); falls back to `currency`
  // if omitted. See db config_builder_routes.py's SaveRecipeRequest.
  functional_currency?: string;
  // Best-effort author of this version (login_user_email_stub cookie), read
  // and passed explicitly by the wizard since configBuilderApi's axios has no
  // dev-user interceptor. Shown as "added by"; omitted if unknown.
  created_by?: string;
  // Set true only when the user ticked "I confirm this is the real account
  // number" to override the structural account-number gate (see backend's
  // SaveRecipeRequest.override_account_validation).
  override_account_validation?: boolean;
  // MULTI-ACCOUNT FAN-OUT. When set, every entry is configured with the SAME
  // `recipe` body in one transaction — this is how a file whose account locator
  // is a COLUMN gets a config for every account it contains, instead of only
  // one. The scalar fields above still describe the primary (first) account so
  // older callers/responses stay meaningful.
  accounts?: AccountAssignment[];
}

// One saved version of a recipe (metadata only — the recipe body is not carried
// in the account list; display is metadata-only).
export interface ConfigVersion {
  version: number;
  created_at: string;
  created_by?: string;
}

// Per-format summary returned by GET /builder/accounts: the full version list
// (newest first) plus which version is active (latest = wins at detection).
export interface FormatSummary {
  format: string;
  active_version: number;
  versions: ConfigVersion[];
}

export interface AccountSummary {
  account_number: string;
  account_last4: string;
  display_name: string;
  bank?: string;
  currency?: string;
  formats: FormatSummary[];
}