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

export interface BuilderTestResult {
  success: boolean;
  row_count: number;
  rows: BuilderTestRow[];
  error?: string;
}

export interface BuilderSaveResult {
  success: boolean;
  config_key: string;
  message: string;
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

export interface LocateAccountResult {
  accounts: string[];
  count: number;
  last4s: string[];
  existing: Record<string, string[]>;   // account -> formats already configured
}

export interface SaveRecipePayload {
  account_number: string;
  display_name: string;
  format: string;                        // xlsx | xls | csv | pdf
  recipe: object;                        // account_locator + source + fields + credit_rule + …
  bank?: string;
  currency?: string;
  ou_number?: string;
  business_unit?: string;
  // Ledger/functional currency for this OU — only used if ou_number is
  // genuinely new (see backend's builder_save); falls back to `currency`
  // if omitted. See db config_builder_routes.py's SaveRecipeRequest.
  functional_currency?: string;
  // Best-effort author of this version (login_user_email_stub cookie), read
  // and passed explicitly by the wizard since configBuilderApi's axios has no
  // dev-user interceptor. Shown as "added by"; omitted if unknown.
  created_by?: string;
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