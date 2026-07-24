"use client";
/**
 * ConfigBuilderWizard
 * ====================
 * 7-step modal wizard for authoring a new bank statement config when the
 * detection engine returns UNKNOWN or the user clicks "Add New Config".
 *
 * Steps
 *   1. Raw File Preview   — view the file as-is, pick the active sheet
 *   2. Header Row         — click a row to mark it as the header; optional sub-header
 *   3. Column Mapping     — map logical fields to file columns
 *   4. Credit Rule        — how to identify credit rows
 *   5. Exclusions         — rows to skip (optional)
 *   6. Test Run           — validate the draft config against the actual file
 *   7. Save               — name the config and persist
 */
import {
  AlertCircle, AlertTriangle, Check, ChevronDown, ChevronLeft,
  ChevronRight, Eye, Info, Loader2, MousePointerClick, Play, Plus, Save, TableProperties, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getBuilderRawPreview, locateAccount, saveRecipe, testBuilderDraft, getAvailableOUs } from "@/lib/configBuilderApi";
import { getErrorMessage } from "@/lib/errorMessage";
import type {
  AccountLocator, BuilderTestResult, CreditRuleConfig, ExclusionRule,
  FieldSource, LogicalField, MergeRule, RawPreviewData,
} from "@/lib/configBuilderTypes";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOGICAL_FIELDS: { name: LogicalField; label: string; required: boolean; noneAllowed?: boolean }[] = [
  { name: "date",           label: "Date",           required: true },
  { name: "narrative",      label: "Narrative",      required: true },
  { name: "credit_amount",  label: "Credit Amount",  required: true },
  { name: "account_number", label: "Account Number", required: true },
  { name: "currency",       label: "Currency",       required: true },
  { name: "bank_name",      label: "Bank Name",      required: true },
  // Required, but the bank's own transaction reference genuinely may not exist in
  // the statement. `noneAllowed` lets "Not in this file" (none) satisfy the
  // requirement — the field still starts unselected so the user consciously picks
  // a column OR "Not in this file" (see fieldSatisfied + the initial mapping).
  { name: "bank_reference", label: "Bank Reference", required: true, noneAllowed: true },
];

// Whether a field's current source counts as a completed choice. "none" only
// satisfies a field that explicitly allows it (bank_reference); for every other
// field the user must point it at real data.
function fieldSatisfied(field: { noneAllowed?: boolean }, src: FieldSource): boolean {
  if (src.type === "column") return !!src.name;
  if (src.type === "cell")   return true;
  if (src.type === "fixed")  return !!src.value?.trim();
  if (src.type === "concat") return (src.names?.length ?? 0) > 0;
  if (src.type === "none")   return field.noneAllowed === true;
  return false;
}

// Strong, general account-number matcher for the regex locator. Captures any
// 6–34 char alphanumeric run that contains at least one digit — covers pure
// numeric accounts (000205024781) and alphanumeric/IBAN-style ones (GB29NWBK…),
// while ignoring plain words. The user picks the real one from the found list.
const AUTO_ACCOUNT_REGEX = "((?=[A-Za-z0-9]*\\d)[A-Za-z0-9]{6,34})";

const DEFAULT_DATE_FORMATS = ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD-MM-YYYY"];

// Plain-language help shown as a tooltip next to each field in Column Mapping.
const FIELD_HELP: Record<LogicalField, string> = {
  date:           "The date the payment arrived — usually the value date or posting date column.",
  narrative:      "The payment description / payer text. The system reads this to identify the customer, so pick the most descriptive column.",
  credit_amount:  "The column showing the amount of money received.",
  account_number: "Your company's bank account the money was paid into. Used to find the matching OU.",
  currency:       "The currency of the payment, e.g. USD or EUR.",
  bank_name:      "The name of the bank. If it isn't in the file, use 'Same value for every row' and type it in.",
  bank_reference: "The bank's own transaction reference number for the payment. If the statement doesn't carry one, choose 'Not in this file'.",
};

// NOTE: "Exclusions" is intentionally hidden from the wizard for now. The
// backend exclusion logic is untouched — new configs simply save an empty
// exclusions list. Re-add "Exclusions" here (and its render branch below) to
// expose it again.
const STEP_LABELS = [
  "Preview", "Header", "Columns", "Credit Rule", "Account", "Test", "Save",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  filename: string;
  onClose: () => void;
  onSaved: (configKey: string) => void;
}

// Best-effort author for the version stamp. configBuilderApi uses its own axios
// instance without the dev-user interceptor, so the wizard reads the login stub
// cookie directly and passes created_by explicitly. Returns undefined if unset.
function readLoginStub(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|; )login_user_email_stub=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConfigBuilderWizard({ filename, onClose, onSaved }: Props) {
  // ── Step ────────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ── Step 1: Raw preview ──────────────────────────────────────────────────────
  const [previewData, setPreviewData]       = useState<RawPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError]     = useState("");
  const [selectedSheet, setSelectedSheet]   = useState("");

  // ── Step 2: Header row ───────────────────────────────────────────────────────
  const [headerRow, setHeaderRow]         = useState<number | null>(null);
  const [subHeaderRow, setSubHeaderRow]   = useState<number | null>(null);
  const [mergeRules, setMergeRules]       = useState<MergeRule[]>([
    { sub_value: "Cr", rename_parent_to: "Amount_Cr" },
    { sub_value: "Dr", rename_parent_to: "Amount_Dr" },
  ]);
  const [pickingSubHeader, setPickingSubHeader] = useState(false);

  // ── Step 3: Column mapping ────────────────────────────────────────────────────
  const [fieldMappings, setFieldMappings] = useState<Record<LogicalField, FieldSource>>({
    date:           { type: "column", name: null },
    narrative:      { type: "column", name: null },
    credit_amount:  { type: "column", name: null },
    account_number: { type: "cell",   row: 1, col: 1 },
    currency:       { type: "cell",   row: 2, col: 1 },
    bank_name:      { type: "fixed",  value: "" },
    // Starts unselected (invalid) so the user must actively pick a column or
    // choose "Not in this file"; auto-wiring only fills it if a ref column exists.
    bank_reference: { type: "column", name: null },
  });

  // ── Step 4: Credit rule ───────────────────────────────────────────────────────
  const [creditRule, setCreditRule] = useState<CreditRuleConfig>({
    type: "column_not_blank", field: "",
  });

  // ── Step 5: Exclusions ────────────────────────────────────────────────────────
  const [exclusions, setExclusions] = useState<ExclusionRule[]>([]);

  // ── Step 5: Locate account ───────────────────────────────────────────────────
  const [accountLocator, setAccountLocator] = useState<AccountLocator>({ type: "cell", row: 0, col: 1 });
  const [foundAccounts, setFoundAccounts]   = useState<string[]>([]);
  const [existingFormats, setExistingFormats] = useState<Record<string, string[]>>({});
  const [accountNumber, setAccountNumber]   = useState("");   // the identifying account for this config
  const [locating, setLocating]             = useState(false);
  const [locateError, setLocateError]       = useState("");

  // ── Step 7: Test ─────────────────────────────────────────────────────────────
  const [testResult, setTestResult]     = useState<BuilderTestResult | null>(null);
  const [testLoading, setTestLoading]   = useState(false);

  // ── Step 7: Save ──────────────────────────────────────────────────────────────
  const [displayName, setDisplayName]     = useState("");
  const [bank, setBank]                   = useState("");
  const [currency, setCurrency]           = useState("");
  const [ouNumber, setOuNumber]           = useState("");
  const [businessUnit, setBusinessUnit]   = useState("");
  const [functionalCurrency, setFunctionalCurrency] = useState("");
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState("");

  // OU/BU picklist — known OUs + OU numbers seen in the currently loaded
  // aging report. Fetched once; the OU step picks from this instead of
  // free-typing an OU number that might not exist.
  const [availableOUs, setAvailableOUs] = useState<{ ou_number: string; business_unit: string | null }[]>([]);
  const [ousLoading, setOusLoading]     = useState(true);
  const [ousError, setOusError]         = useState("");
  useEffect(() => {
    getAvailableOUs()
      .then((res) => setAvailableOUs(res.data?.ous ?? []))
      .catch((e) => { setAvailableOUs([]); setOusError(getErrorMessage(e, "Could not load Organization Units.")); })
      .finally(() => setOusLoading(false));
  }, []);

  // ── Load raw preview on mount ─────────────────────────────────────────────────
  useEffect(() => {
    setPreviewLoading(true);
    getBuilderRawPreview(filename)
      .then((res) => {
        setPreviewData(res.data);
        if (res.data.sheets?.length > 0) {
          setSelectedSheet(res.data.sheets[0].name);
        }
      })
      .catch(() => setPreviewError("Could not load file preview."))
      .finally(() => setPreviewLoading(false));
  }, [filename]);

  // ── Derived: active sheet rows ────────────────────────────────────────────────
  const activeSheet = previewData?.sheets.find((s) => s.name === selectedSheet);
  const activeRows  = activeSheet?.rows ?? [];

  // ── Derived: column names from header row ─────────────────────────────────────
  const derivedColumns = useCallback((): string[] => {
    if (headerRow === null || activeRows.length === 0) return [];
    const headerValues = activeRows[headerRow] ?? [];

    if (subHeaderRow === null) {
      return headerValues.map((v, i) => v || `Col_${i}`);
    }

    // Merge sub-header using declared rules
    const subValues = activeRows[subHeaderRow] ?? [];
    const ruleMap: Record<string, string> = {};
    mergeRules.forEach((r) => {
      ruleMap[r.sub_value.toLowerCase()] = r.rename_parent_to;
    });

    return headerValues.map((parent, i) => {
      const sub   = subValues[i] ?? "";
      const renamed = ruleMap[sub.toLowerCase()];
      if (renamed) return renamed;
      return parent || sub || `Col_${i}`;
    });
  }, [headerRow, subHeaderRow, activeRows, mergeRules]);

  const columns = derivedColumns();

  // ── Build the source block (engine + sheet + header) ───────────────────────────
  const buildSource = useCallback(() => {
    const ext = previewData?.extension ?? "xlsx";
    const isCsv = ext === "csv" || ext === "txt";
    const headerCfg: Record<string, unknown> = { row: headerRow ?? 0 };
    if (!isCsv && subHeaderRow !== null) {
      headerCfg.merge_rows = [{
        row: subHeaderRow,
        rules: mergeRules.map((r) => ({ sub_value: r.sub_value, rename_parent_to: r.rename_parent_to })),
      }];
    }
    return isCsv
      ? { engine: "csv", header: headerCfg, encoding: "auto", delimiter: "auto" }
      : { engine: "excel", sheet: { by: "name", value: selectedSheet }, header: headerCfg };
  }, [previewData, selectedSheet, headerRow, subHeaderRow, mergeRules]);

  // ── Build the recipe draft (account_locator + source + fields + credit_rule + …) ─
  const buildConfigDraft = useCallback(() => {
    const ext = previewData?.extension ?? "xlsx";
    const isCsv = ext === "csv" || ext === "txt";

    const headerCfg: Record<string, unknown> = { row: headerRow ?? 0 };

    if (!isCsv && subHeaderRow !== null) {
      headerCfg.merge_rows = [{
        row: subHeaderRow,
        rules: mergeRules.map((r) => ({
          sub_value: r.sub_value,
          rename_parent_to: r.rename_parent_to,
        })),
      }];
    }

    const fields = LOGICAL_FIELDS.map(({ name }) => {
      const src = fieldMappings[name];
      let fromObj: Record<string, unknown>;

      if (src.type === "column") {
        fromObj = { type: "column", name: src.name ?? null };
      } else if (src.type === "cell") {
        fromObj = { type: "cell", row: src.row ?? 0, col: src.col ?? 0 };
      } else if (src.type === "fixed") {
        fromObj = { type: "fixed", value: src.value ?? "" };
      } else if (src.type === "concat") {
        fromObj = { type: "concat", names: src.names ?? [], sep: src.sep ?? " " };
      } else {
        fromObj = { type: "column", name: null };
      }

      return { name, from: fromObj };
    });

    void isCsv; void headerCfg;
    // A recipe: account_locator + source + fields + credit_rule + cleanup. No
    // fingerprints/filename — the account number identifies the file.
    return {
      key:             "_DRAFT_",
      account_locator: accountLocator,
      source:          buildSource(),
      fields,
      credit_rule: {
        type:    creditRule.type,
        field:   creditRule.field,
        ...(creditRule.type === "flag_matches" && { pattern: creditRule.pattern ?? "" }),
      },
      exclusions,
      transforms:   {},
      date_formats: DEFAULT_DATE_FORMATS,
    };
  }, [
    previewData, headerRow, buildSource, fieldMappings, creditRule, exclusions, accountLocator,
  ]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleRowClick = (rowIdx: number) => {
    if (step !== 2) return;
    if (pickingSubHeader) {
      if (rowIdx !== headerRow) {
        setSubHeaderRow(rowIdx);
      }
      setPickingSubHeader(false);
    } else {
      setHeaderRow(rowIdx);
      setSubHeaderRow(null);
    }
  };

  const handleTestRun = async () => {
    if (!previewData) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const draft = buildConfigDraft();
      const res = await testBuilderDraft(previewData.storage_key, draft);
      setTestResult(res.data);
    } catch (e: any) {
      setTestResult({ success: false, error: getErrorMessage(e, String(e)), row_count: 0, rows: [] });
    } finally {
      setTestLoading(false);
    }
  };

  // ── Step 5: locate the account number in the file ──────────────────────────────
  const handleLocate = async () => {
    if (!previewData) return;
    setLocating(true);
    setLocateError("");
    try {
      const res = await locateAccount(previewData.storage_key, accountLocator, buildSource());
      const accts: string[] = res.data.accounts ?? [];
      setFoundAccounts(accts);
      setExistingFormats(res.data.existing ?? {});
      if (accts.length === 1) setAccountNumber(accts[0]);
      else if (accts.length > 1 && !accts.includes(accountNumber)) setAccountNumber("");
      if (accts.length === 0) setLocateError("No account number found with this rule — adjust and try again.");
    } catch (e: any) {
      setLocateError(getErrorMessage(e, "Could not read the account. Adjust the rule and retry."));
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) { setSaveError("Bank / Statement name is required."); return; }
    if (!accountNumber.trim()) { setSaveError("Locate and confirm an account number first (step 5)."); return; }
    if (!bank.trim() || !currency.trim()) { setSaveError("Bank and Currency are required."); return; }
    if (!ouNumber.trim() || !businessUnit.trim()) { setSaveError("OU Number and Business Unit are required."); return; }
    setSaving(true);
    setSaveError("");
    try {
      const recipe = buildConfigDraft();
      const ext = previewData?.extension ?? "xlsx";
      const format = ext === "txt" ? "csv" : ext === "xlsm" ? "xlsx" : ext;
      await saveRecipe({
        account_number: accountNumber.trim(),
        display_name: displayName.trim(),
        format,
        recipe,
        bank: bank.trim() || undefined,
        currency: currency.trim() || undefined,
        ou_number: ouNumber.trim(),
        business_unit: businessUnit.trim(),
        functional_currency: functionalCurrency.trim() || undefined,
        created_by: readLoginStub(),
      });
      onSaved(accountNumber.trim());
    } catch (e: any) {
      setSaveError(getErrorMessage(e, "Save failed. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  // ── Prefill Save-tab identity fields from the Columns-tab mappings ─────────────
  // Bank / Currency come from the mapped fields; the display name is composed as
  // "Bank — Currency". Runs once when the user first reaches Save; all editable.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (step !== 7 || prefilledRef.current) return;
    prefilledRef.current = true;
    const sampleRow = activeRows[(headerRow ?? 0) + 1] ?? [];
    const valueOf = (name: LogicalField): string => {
      const src = fieldMappings[name];
      if (!src) return "";
      if (src.type === "fixed")  return (src.value ?? "").trim();
      if (src.type === "cell")   return String(activeRows[src.row ?? 0]?.[src.col ?? 0] ?? "").trim();
      if (src.type === "column") {
        const idx = columns.indexOf(src.name ?? "");
        return idx >= 0 ? String(sampleRow[idx] ?? "").trim() : "";
      }
      if (src.type === "concat") {
        return (src.names ?? [])
          .map((n) => { const idx = columns.indexOf(n); return idx >= 0 ? String(sampleRow[idx] ?? "").trim() : ""; })
          .filter(Boolean).join(src.sep ?? " ");
      }
      return "";
    };
    const b = valueOf("bank_name");
    const c = valueOf("currency");
    if (b && !bank) setBank(b);
    if (c && !currency) setCurrency(c);
    if (!displayName) {
      const composed = [b, c].filter(Boolean).join(" — ");
      if (composed) setDisplayName(composed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Internal test: structural checks that must hold before the user test ───────
  // (Q: "structure + account only" — we do NOT require credit rows > 0.)
  const internalChecks = useCallback((): { label: string; ok: boolean }[] => {
    const requiredMapped = LOGICAL_FIELDS.filter((f) => f.required).every((f) =>
      fieldSatisfied(f, fieldMappings[f.name]));
    return [
      { label: "Header row selected",              ok: headerRow !== null },
      { label: "All required columns are mapped",  ok: requiredMapped },
      { label: "Credit rule column selected",      ok: !!creditRule.field },
      { label: "Account number identified",        ok: !!accountNumber.trim() },
    ];
  }, [fieldMappings, creditRule, accountNumber, headerRow]);

  const internalPass = internalChecks().every((c) => c.ok);
  // The draft must pass BOTH the internal checks and the live parse (user test)
  // before the user can advance to Save.
  const testPassed = internalPass && testResult?.success === true;

  // Any edit that changes the recipe invalidates a prior passing test — force a re-run.
  useEffect(() => {
    setTestResult(null);
  }, [fieldMappings, creditRule, accountLocator, accountNumber, headerRow, subHeaderRow, selectedSheet, mergeRules]);

  // ── Validation helpers ────────────────────────────────────────────────────────
  const canProceed = (): boolean => {
    if (step === 2) return headerRow !== null;
    if (step === 3) {
      return LOGICAL_FIELDS.filter((f) => f.required).every((f) =>
        fieldSatisfied(f, fieldMappings[f.name]));
    }
    if (step === 4) return !!creditRule.field;
    if (step === 5) return !!accountNumber.trim();     // Account step
    if (step === 6) return testPassed;                 // Test step — must pass internal + user test
    if (step === 7) return !!displayName.trim() && !!ouNumber.trim() && !!businessUnit.trim();
    return true;
  };

  // ── Column auto-wiring on entering step 3 ────────────────────────────────────
  const lastAutoWireRef = useRef<number>(-1);
  useEffect(() => {
    if (step !== 3 || columns.length === 0) return;
    if (lastAutoWireRef.current === headerRow) return;
    lastAutoWireRef.current = headerRow ?? -1;

    const colsLower = columns.map((c) => (c ?? "").toLowerCase());
    // Tokenise on non-alphanumerics so short markers (cr, dr, ref) match as whole
    // words, not as substrings hiding inside other words (e.g. "cr" in
    // "description"). hasTok = whole-word match; hasSub = raw substring match.
    const colTokens = colsLower.map((c) => c.replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean));
    const hasTok = (i: number, t: string) => colTokens[i].includes(t);
    const hasSub = (i: number, s: string) => colsLower[i].includes(s);
    // Try predicates in priority order; return the first column matching one.
    const pick = (...preds: ((i: number) => boolean)[]): string | null => {
      for (const pred of preds) {
        const i = columns.findIndex((_, idx) => pred(idx));
        if (i >= 0) return columns[i];
      }
      return null;
    };

    const dateCol = pick(
      (i) => hasSub(i, "value date") || hasSub(i, "posting date"),
      (i) => hasTok(i, "date"),
      (i) => hasSub(i, "date"),
    );
    const narrativeCol = pick(
      (i) => hasSub(i, "narrative") || hasSub(i, "description"),
      (i) => hasSub(i, "customer name") || hasSub(i, "remitter") || hasSub(i, "payer") || hasSub(i, "sender"),
      (i) => hasSub(i, "remark") || hasSub(i, "concept") || hasSub(i, "particular") || hasSub(i, "detail") || hasSub(i, "purpose"),
    );
    // Credit amount: prefer an explicit credit column and NEVER a debit column;
    // only fall back to a lone "amount" column when there's no separate Dr/Cr
    // split (this is what previously mis-picked Amount_Dr via a bare "amount").
    const creditCol = pick(
      (i) => (hasTok(i, "cr") || hasTok(i, "credit")) && !hasTok(i, "dr") && !hasTok(i, "debit"),
      (i) => (hasSub(i, "amount_cr") || hasSub(i, "credit amount") || hasSub(i, "cr amount")) && !hasSub(i, "debit"),
      (i) => hasSub(i, "credit") && !hasSub(i, "debit"),
      (i) => (hasTok(i, "amount") || hasSub(i, "amount")) && !hasTok(i, "dr") && !hasTok(i, "debit") && !hasSub(i, "balance"),
    );
    const refCol = pick(
      (i) => hasSub(i, "bank ref") || hasSub(i, "transaction ref") || hasSub(i, "utr") || hasSub(i, "rrn"),
      (i) => hasSub(i, "reference"),
      (i) => hasTok(i, "ref"),
    );

    setFieldMappings((prev) => ({
      ...prev,
      date:          { type: "column", name: dateCol },
      narrative:     { type: "column", name: narrativeCol },
      credit_amount: { type: "column", name: creditCol },
      // Only auto-fill the reference when we actually spot one; otherwise leave it
      // unselected so the user consciously picks a column or "Not in this file".
      bank_reference: refCol ? { type: "column", name: refCol } : prev.bank_reference,
    }));
    // NOTE: the Credit Rule column is intentionally NOT pre-selected — the user
    // must consciously pick it on the Credit Rule step.
  }, [step, columns, headerRow]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const modal = (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/60 backdrop-blur-sm">
      <div className="flex flex-col bg-white h-full max-h-screen overflow-hidden">

        {/* ── Top bar ── */}
        <div className="bg-[#222222] text-white px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <TableProperties size={16} className="text-[#222222]" />
            <div>
              <div className="text-xs font-black uppercase tracking-wider">Config Builder</div>
              <div className="text-[10px] text-gray-400 font-mono truncate max-w-xs">{filename}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* ── Step indicator ── */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-0 min-w-max">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const active  = step === n;
              const done    = step > n;
              return (
                <div key={n} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                        active ? "bg-[#222222] text-white" :
                        done   ? "bg-emerald-500 text-white" :
                                 "bg-gray-200 text-gray-400"
                      }`}
                    >
                      {done ? <Check size={10} /> : n}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                      active ? "text-[#222222]" : done ? "text-emerald-600" : "text-gray-400"
                    }`}>{label}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div className="w-8 h-px bg-gray-200 mx-2 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {previewLoading ? (
            <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm font-medium">Loading file preview…</span>
            </div>
          ) : previewError ? (
            <div className="flex items-center gap-2 text-red-600 text-sm p-4 bg-red-50 border border-red-200 rounded">
              <AlertCircle size={16} /> {previewError}
            </div>
          ) : (
            <>
              {step === 1 && <StepPreview {...{ previewData, selectedSheet, setSelectedSheet }} />}
              {step === 2 && (
                <StepHeader {...{
                  previewData, selectedSheet, setSelectedSheet,
                  headerRow, subHeaderRow, pickingSubHeader, setPickingSubHeader,
                  setSubHeaderRow,
                  mergeRules, setMergeRules, handleRowClick,
                  derivedColumns: columns,
                  isCsv: ["csv", "txt"].includes(previewData?.extension ?? ""),
                }} />
              )}
              {step === 3 && (
                <StepColumns {...{
                  columns, fieldMappings, setFieldMappings,
                  activeRows, headerRow,
                }} />
              )}
              {step === 4 && (
                <StepCreditRule {...{ columns, creditRule, setCreditRule, activeRows, headerRow, subHeaderRow }} />
              )}
              {step === 5 && (
                <StepLocateAccount {...{
                  columns, activeRows, headerRow, accountLocator, setAccountLocator,
                  foundAccounts, existingFormats, accountNumber, setAccountNumber,
                  locating, locateError, handleLocate,
                  extension: previewData?.extension ?? "xlsx",
                }} />
              )}
              {step === 6 && (
                <StepTestRun {...{
                  testResult, testLoading, handleTestRun,
                  checks: internalChecks(), internalPass, testPassed,
                }} />
              )}
              {step === 7 && (
                <StepSave {...{
                  displayName, setDisplayName,
                  bank, setBank, currency, setCurrency,
                  ouNumber, setOuNumber, businessUnit, setBusinessUnit,
                  functionalCurrency, setFunctionalCurrency,
                  accountNumber, existingFormats,
                  extension: previewData?.extension ?? "xlsx",
                  saving, saveError,
                  availableOUs, ousLoading, ousError,
                }} />
              )}
            </>
          )}
        </div>

        {/* ── Navigation ── */}
        <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 bg-white">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer px-3 py-2"
          >
            <ChevronLeft size={14} /> Previous
          </button>

          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Step {step} of {STEP_LABELS.length}
          </div>

          {step < STEP_LABELS.length ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed() || previewLoading}
              className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-[#222222] hover:bg-[#222222] text-white px-4 py-2 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs transition-colors"
            >
              {step === 6 ? "Looks good" : "Next"} <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={!canProceed() || saving}
              className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Config
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Portal to <body> so the modal's `fixed inset-0` is measured against the
  // viewport, not the padded/transformed <main> content area (which otherwise
  // leaves a gap at the top matching main's padding).
  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 1 — Raw File Preview
// ═══════════════════════════════════════════════════════════════════════════════

function StepPreview({
  previewData, selectedSheet, setSelectedSheet,
}: {
  previewData: RawPreviewData | null;
  selectedSheet: string;
  setSelectedSheet: (s: string) => void;
}) {
  const activeSheet = previewData?.sheets.find((s) => s.name === selectedSheet);
  const rows        = activeSheet?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Eye size={15} className="text-gray-400" />
        <h2 className="text-sm font-black text-gray-500 uppercase tracking-wider">Raw File Preview</h2>
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">Read only</span>
      </div>
      <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-3 py-2">
        <Info size={13} className="shrink-0 mt-0.5 text-gray-400" />
        <span>This is just a look at the file as-is — <strong>nothing is clickable here</strong>. Review the layout, then move to the next step to pick your header row.</span>
      </div>

      {/* Sheet tabs */}
      <SheetTabs sheets={previewData?.sheets ?? []} selected={selectedSheet} onChange={setSelectedSheet} />

      {/* Raw grid — neutral, non-interactive styling to contrast with the Header step */}
      <div className="grayscale-[15%] opacity-95">
        <RawGrid rows={rows} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 2 — Header Row Selection
// ═══════════════════════════════════════════════════════════════════════════════

function StepHeader({
  previewData, selectedSheet, setSelectedSheet,
  headerRow, subHeaderRow, pickingSubHeader, setPickingSubHeader, setSubHeaderRow,
  mergeRules, setMergeRules, handleRowClick, derivedColumns, isCsv,
}: {
  previewData: RawPreviewData | null;
  selectedSheet: string;
  setSelectedSheet: (s: string) => void;
  headerRow: number | null;
  subHeaderRow: number | null;
  pickingSubHeader: boolean;
  setPickingSubHeader: (v: boolean) => void;
  setSubHeaderRow: (r: number | null) => void;
  mergeRules: MergeRule[];
  setMergeRules: (r: MergeRule[]) => void;
  handleRowClick: (i: number) => void;
  derivedColumns: string[];
  isCsv: boolean;
}) {
  const activeSheet = previewData?.sheets.find((s) => s.name === selectedSheet);
  const rows        = activeSheet?.rows ?? [];

  const updateMergeRule = (i: number, key: keyof MergeRule, val: string) => {
    setMergeRules(mergeRules.map((r, j) => j === i ? { ...r, [key]: val } : r));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MousePointerClick size={16} className="text-[#222222]" />
        <h2 className="text-sm font-black text-[#222222] uppercase tracking-wider">Select Header Row</h2>
        <span className="text-[9px] font-black uppercase tracking-widest text-white bg-[#222222] px-2 py-0.5 rounded-full">Interactive</span>
      </div>
      <div className="flex items-start gap-2 text-xs text-[#222222] bg-blue-50 border border-[#222222]/40 rounded px-3 py-2 font-medium">
        <MousePointerClick size={14} className="shrink-0 mt-0.5 text-[#222222]" />
        <span>
          {pickingSubHeader
            ? "Now click the sub-header row (the row below the main header with Dr/Cr labels)."
            : "Click the row in the table below that contains your column titles — it turns dark blue when selected."}
        </span>
      </div>

      <SheetTabs sheets={previewData?.sheets ?? []} selected={selectedSheet} onChange={setSelectedSheet} />

      {/* Clickable grid — blue-accented, interactive to contrast with the Preview step */}
      <div className="border-2 border-[#222222]/50 rounded overflow-auto max-h-72 ring-1 ring-blue-100">
        <table className="text-[11px] font-mono w-full border-collapse">
          <tbody>
            {rows.map((row, ri) => {
              const isHeader    = ri === headerRow;
              const isSubHeader = ri === subHeaderRow;
              const rowBg =
                isHeader    ? "bg-[#222222] text-white cursor-pointer" :
                isSubHeader ? "bg-[#222222] text-white cursor-pointer" :
                pickingSubHeader ? "hover:bg-yellow-50 cursor-pointer" : "hover:bg-blue-50 cursor-pointer";

              return (
                <tr key={ri} className={rowBg} onClick={() => handleRowClick(ri)}>
                  <td className={`w-8 px-2 py-1 text-center font-bold border-r border-gray-200 text-[10px] select-none ${
                    isHeader || isSubHeader ? "bg-transparent text-white/80" : "bg-blue-50 text-[#222222]"
                  }`}>
                    {ri}
                  </td>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1 border-r border-gray-100 whitespace-nowrap max-w-[160px] truncate">
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected header info */}
      {headerRow !== null && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs">
            <div className="bg-[#222222] text-white px-2.5 py-1 rounded-sm font-bold">
              Header: Row {headerRow}
            </div>
            {subHeaderRow !== null && (
              <div className="bg-[#222222] text-white px-2.5 py-1 rounded-sm font-bold">
                Sub-header: Row {subHeaderRow}
              </div>
            )}
            {!isCsv && (subHeaderRow === null ? (
              <button
                onClick={() => setPickingSubHeader(true)}
                className="flex items-center gap-1 text-[#222222] hover:underline font-bold cursor-pointer"
              >
                <Plus size={12} /> Add sub-header row
              </button>
            ) : (
              <button
                onClick={() => { setSubHeaderRow(null); setPickingSubHeader(false); }}
                className="text-gray-400 hover:text-red-500 text-xs cursor-pointer"
              >
                Remove sub-header
              </button>
            ))}
          </div>

          {/* Merge rules (only when sub-header selected, not for CSV) */}
          {!isCsv && subHeaderRow !== null && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700">
                <Info size={13} /> Define how sub-header values rename the parent column
              </div>
              <div className="space-y-2">
                {mergeRules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 w-28">When sub value =</span>
                    <input
                      value={rule.sub_value}
                      onChange={(e) => updateMergeRule(i, "sub_value", e.target.value)}
                      className="border border-gray-300 rounded-sm px-2 py-1 w-20 font-mono text-xs"
                    />
                    <span className="text-gray-500">→ rename to</span>
                    <input
                      value={rule.rename_parent_to}
                      onChange={(e) => updateMergeRule(i, "rename_parent_to", e.target.value)}
                      className="border border-gray-300 rounded-sm px-2 py-1 w-28 font-mono text-xs"
                    />
                    <button
                      onClick={() => setMergeRules(mergeRules.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setMergeRules([...mergeRules, { sub_value: "", rename_parent_to: "" }])}
                  className="flex items-center gap-1 text-[10px] text-[#222222] hover:underline font-bold cursor-pointer"
                >
                  <Plus size={11} /> Add rule
                </button>
              </div>
            </div>
          )}

          {/* Detected columns preview */}
          {derivedColumns.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Detected columns ({derivedColumns.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {derivedColumns.map((col, i) => (
                  <span
                    key={i}
                    className="bg-gray-100 text-gray-700 text-[11px] font-mono px-2 py-0.5 rounded-sm"
                  >
                    {col || <span className="text-gray-400 italic">empty</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {headerRow === null && (
        <div className="flex items-center gap-2 text-amber-600 text-xs bg-amber-50 border border-amber-200 p-3 rounded">
          <AlertTriangle size={14} /> Click a row above to select it as the header.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 3 — Column Mapping
// ═══════════════════════════════════════════════════════════════════════════════

interface ColumnMapperProps {
  columns: string[];
  fieldMappings: Record<LogicalField, FieldSource>;
  setFieldMappings: (m: Record<LogicalField, FieldSource>) => void;
  activeRows: string[][];
  headerRow: number | null;
}

// Per-field colour + short label for the click-to-map grid. Full static class
// strings (no interpolation) so Tailwind's JIT keeps them in the build.
const FIELD_STYLE: Record<LogicalField, { badge: string; card: string; dot: string; ring: string }> = {
  date:           { badge: "bg-blue-600 text-white",    card: "border-blue-400 bg-blue-50",     dot: "bg-blue-600",    ring: "ring-blue-400" },
  narrative:      { badge: "bg-violet-600 text-white",  card: "border-violet-400 bg-violet-50", dot: "bg-violet-600",  ring: "ring-violet-400" },
  credit_amount:  { badge: "bg-emerald-600 text-white", card: "border-emerald-400 bg-emerald-50", dot: "bg-emerald-600", ring: "ring-emerald-400" },
  account_number: { badge: "bg-amber-600 text-white",   card: "border-amber-400 bg-amber-50",   dot: "bg-amber-600",   ring: "ring-amber-400" },
  currency:       { badge: "bg-cyan-600 text-white",    card: "border-cyan-400 bg-cyan-50",     dot: "bg-cyan-600",    ring: "ring-cyan-400" },
  bank_name:      { badge: "bg-rose-600 text-white",    card: "border-rose-400 bg-rose-50",     dot: "bg-rose-600",    ring: "ring-rose-400" },
  bank_reference: { badge: "bg-slate-600 text-white",   card: "border-slate-400 bg-slate-50",   dot: "bg-slate-600",   ring: "ring-slate-400" },
};

const FIELD_SHORT: Record<LogicalField, string> = {
  date: "Date", narrative: "Narrative", credit_amount: "Credit",
  account_number: "Account", currency: "Currency", bank_name: "Bank", bank_reference: "Ref",
};

const MODE_CHIPS: { type: FieldSource["type"]; label: string }[] = [
  { type: "column", label: "Column" },
  { type: "cell",   label: "Cell" },
  { type: "concat", label: "Combine" },
  { type: "fixed",  label: "Fixed" },
  { type: "none",   label: "Not in file" },
];

// ── Shared clickable preview grid (Steps 3/4/5) ────────────────────────────────
// Generic, prop-driven: it owns rendering + click plumbing only, no field/rule
// knowledge. The header row (index `headerRow`) renders the derived column names;
// every other row shows raw cell text. Callers decide what is clickable, what is
// highlighted, how rows are tinted, and what badges decorate each cell.
interface PreviewGridProps {
  columns: string[];            // derived header names, index-aligned to raw cols
  activeRows: string[][];
  headerRow: number;
  interactive?: boolean;        // false → dim + disable all clicks
  isCellClickable?: (ri: number, ci: number, isHeader: boolean) => boolean;
  onCellClick?: (ri: number, ci: number, isHeader: boolean) => void;
  rowTint?: (ri: number) => "credit" | "skip" | undefined;
  cellHighlight?: (ri: number, ci: number, isHeader: boolean) => boolean;
  cellDecoration?: (ri: number, ci: number, isHeader: boolean) => ReactNode;
  maxHeightClass?: string;
}

function PreviewGrid({
  columns, activeRows, headerRow,
  interactive = true,
  isCellClickable, onCellClick, rowTint, cellHighlight, cellDecoration,
  maxHeightClass = "max-h-96",
}: PreviewGridProps) {
  return (
    <div className={`border-2 rounded overflow-auto ${maxHeightClass} ${
      interactive ? "border-[#222222]/40 ring-1 ring-blue-100" : "border-gray-200 opacity-70"
    }`}>
      <table className="text-[11px] font-mono w-full border-collapse">
        <tbody>
          {activeRows.map((row, ri) => {
            const isHeader = ri === headerRow;
            const cells = isHeader ? columns : row;
            const tint = !isHeader ? rowTint?.(ri) : undefined;
            const rowBg = isHeader
              ? "bg-gray-900/95"
              : tint === "credit" ? "bg-emerald-50"
              : tint === "skip"   ? "bg-gray-50 text-gray-400"
              : "even:bg-gray-50";
            return (
              <tr key={ri} className={rowBg}>
                <td className={`w-8 px-2 py-1 text-center font-bold border-r text-[10px] select-none ${
                  isHeader ? "bg-transparent text-white/70 border-white/20" : "bg-gray-50 text-gray-400 border-gray-200"
                }`}>
                  {ri}
                </td>
                {cells.map((cell, ci) => {
                  const clickable = interactive && (isCellClickable?.(ri, ci, isHeader) ?? false);
                  const highlighted = cellHighlight?.(ri, ci, isHeader) ?? false;
                  return (
                    <td
                      key={ci}
                      onClick={clickable ? () => onCellClick?.(ri, ci, isHeader) : undefined}
                      className={`px-2 py-1 border-r whitespace-nowrap max-w-[160px] align-top ${
                        isHeader ? "border-white/10 text-white font-bold" : "border-gray-100"
                      } ${clickable ? "cursor-pointer hover:bg-blue-500/20" : ""} ${
                        highlighted ? (isHeader ? "ring-2 ring-inset ring-amber-400 bg-amber-500/20" : "ring-2 ring-inset ring-[#222222] bg-blue-500/10") : ""
                      }`}
                    >
                      <div className="truncate">{cell || (isHeader ? <span className="text-white/40 italic">empty</span> : "")}</div>
                      {cellDecoration?.(ri, ci, isHeader)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// StepColumns is a thin shell around two interchangeable mappers that both edit
// the same `fieldMappings` state: the new click-to-map grid (default) and the
// original per-field dropdowns (fallback). A toggle switches between them.
function StepColumns(props: ColumnMapperProps) {
  const [viewMode, setViewMode] = useState<"preview" | "dropdown">("preview");
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-primary uppercase tracking-wider">Match Your Columns</h2>
          <p className="text-xs text-gray-500 mt-1">
            Tell us which part of your file holds each item. We&apos;ve pre-filled our best guesses — check each one and correct it if needed. Required items are marked <span className="text-red-500 font-bold">*</span>.
          </p>
        </div>
        <div className="flex items-center bg-gray-100 rounded-md p-0.5 shrink-0">
          {([["preview", "Pick from preview"], ["dropdown", "Use dropdowns"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewMode(v)}
              className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-sm cursor-pointer transition-colors ${
                viewMode === v ? "bg-white text-primary shadow-xs" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {viewMode === "preview"
        ? <PreviewColumnMapper {...props} />
        : <DropdownColumnMapper {...props} />}
    </div>
  );
}

// ── Preview mode: field-first click-to-map ─────────────────────────────────────
// Arm a field on the left, pick its source mode (Column / Cell / Combine / Fixed
// / Not in file), then click in the grid. Column & Combine pick from the header
// row; Cell picks any single cell (incl. metadata above the header).
function PreviewColumnMapper({ columns, fieldMappings, setFieldMappings, activeRows, headerRow }: ColumnMapperProps) {
  const hRow = headerRow ?? 0;
  const [armed, setArmed] = useState<LogicalField>(LOGICAL_FIELDS[0].name);
  const armedSrc = fieldMappings[armed];
  const mode = armedSrc.type;

  const updateField = (name: LogicalField, src: FieldSource) =>
    setFieldMappings({ ...fieldMappings, [name]: src });

  const setMode = (name: LogicalField, type: FieldSource["type"]) => {
    const cur = fieldMappings[name];
    if (type === "column")      updateField(name, { type: "column", name: cur.type === "column" ? cur.name ?? null : null });
    else if (type === "cell")   updateField(name, { type: "cell", row: cur.type === "cell" ? cur.row ?? hRow : hRow, col: cur.type === "cell" ? cur.col ?? 0 : 0 });
    else if (type === "concat") updateField(name, { type: "concat", names: cur.type === "concat" ? cur.names ?? [] : [], sep: cur.type === "concat" ? cur.sep ?? " " : " " });
    else if (type === "fixed")  updateField(name, { type: "fixed", value: cur.type === "fixed" ? cur.value ?? "" : "" });
    else                        updateField(name, { type: "none" });
  };

  const isMapped = (name: LogicalField): boolean => {
    const field = LOGICAL_FIELDS.find((f) => f.name === name);
    return field ? fieldSatisfied(field, fieldMappings[name]) : false;
  };

  // After a column assignment, jump to the next required field still unmapped.
  const advanceFrom = (justSet: LogicalField) => {
    const order = LOGICAL_FIELDS.map((f) => f.name);
    const reqd = new Set(LOGICAL_FIELDS.filter((f) => f.required).map((f) => f.name));
    const start = order.indexOf(justSet);
    for (let k = 1; k < order.length; k++) {
      const cand = order[(start + k) % order.length];
      if (reqd.has(cand) && !isMapped(cand)) { setArmed(cand); return; }
    }
  };

  const sampleRow = activeRows[hRow + 1] ?? [];
  const columnSample = (colName: string | null | undefined): string => {
    if (!colName) return "";
    const idx = columns.indexOf(colName);
    return idx >= 0 ? (sampleRow[idx] ?? "") : "";
  };

  // Fields sitting on a header column (column-type name match or concat member).
  const fieldsOnColumn = (ci: number): LogicalField[] =>
    LOGICAL_FIELDS.filter(({ name }) => {
      const s = fieldMappings[name];
      if (s.type === "column") return s.name === columns[ci];
      if (s.type === "concat") return (s.names ?? []).includes(columns[ci]);
      return false;
    }).map((f) => f.name);

  const fieldOnCell = (ri: number, ci: number): LogicalField | undefined =>
    LOGICAL_FIELDS.find(({ name }) => {
      const s = fieldMappings[name];
      return s.type === "cell" && s.row === ri && s.col === ci;
    })?.name;

  const handleCellClick = (ri: number, ci: number) => {
    const isHeader = ri === hRow;
    if (mode === "cell") {
      updateField(armed, { type: "cell", row: ri, col: ci });
      return;
    }
    if (!isHeader) return;                       // Column & Combine pick from the header row only
    const colName = columns[ci];
    if (mode === "column") {
      updateField(armed, { type: "column", name: colName });
      advanceFrom(armed);
    } else if (mode === "concat") {
      const cur = armedSrc.type === "concat" ? armedSrc.names ?? [] : [];
      const next = cur.includes(colName) ? cur.filter((x) => x !== colName) : [...cur, colName];
      updateField(armed, { type: "concat", names: next, sep: armedSrc.type === "concat" ? armedSrc.sep ?? " " : " " });
    }
    // fixed / none: header clicks do nothing
  };

  const summary = (name: LogicalField): string => {
    const s = fieldMappings[name];
    if (s.type === "column") return s.name ? `Column: ${s.name}` : "Click a column header…";
    if (s.type === "cell") {
      const v = String(activeRows[s.row ?? 0]?.[s.col ?? 0] ?? "");
      return `Cell R${s.row}·C${s.col}${v ? ` → "${v}"` : ""}`;
    }
    if (s.type === "concat") return (s.names?.length ?? 0) ? `Combine: ${(s.names ?? []).join(" + ")}` : "Click column headers…";
    if (s.type === "fixed")  return s.value?.trim() ? `Fixed: "${s.value}"` : "Type a value…";
    return "Not in this file";
  };

  const gridInteractive = mode === "column" || mode === "concat" || mode === "cell";
  const armedLabel = LOGICAL_FIELDS.find((f) => f.name === armed)?.label;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Field rail */}
      <div className="lg:col-span-2 space-y-2">
        {LOGICAL_FIELDS.map(({ name, label, required }) => {
          const active = armed === name;
          const mapped = isMapped(name);
          const st = FIELD_STYLE[name];
          return (
            <div
              key={name}
              onClick={() => setArmed(name)}
              className={`rounded-md border p-2.5 cursor-pointer transition-colors ${
                active ? `${st.card} ring-2 ${st.ring}` : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />
                <span className="text-xs font-black text-primary uppercase tracking-wider">
                  {label} {required && <span className="text-red-500">*</span>}
                </span>
                {mapped && <Check size={13} className="text-emerald-500 ml-auto shrink-0" />}
              </div>
              <div className={`text-[10px] mt-1 font-mono truncate ${mapped ? "text-gray-600" : "text-gray-400 italic"}`}>
                {summary(name)}
              </div>

              {active && (
                <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1">
                    {MODE_CHIPS.map((chip) => (
                      <button
                        key={chip.type}
                        type="button"
                        onClick={() => setMode(name, chip.type)}
                        className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm border cursor-pointer ${
                          mode === chip.type
                            ? "bg-[#222222] text-white border-[#222222]"
                            : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  {mode === "fixed" && (
                    <input
                      type="text"
                      autoFocus
                      placeholder="Value used for every row…"
                      value={armedSrc.type === "fixed" ? armedSrc.value ?? "" : ""}
                      onChange={(e) => updateField(name, { type: "fixed", value: e.target.value })}
                      className="w-full text-xs border border-gray-300 rounded-sm px-2 py-1 font-mono focus:outline-none focus:border-[#222222]"
                    />
                  )}

                  {mode === "concat" && (
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-gray-500">Separator</span>
                      <input
                        value={armedSrc.type === "concat" ? armedSrc.sep ?? " " : " "}
                        onChange={(e) => updateField(name, { type: "concat", names: armedSrc.type === "concat" ? armedSrc.names ?? [] : [], sep: e.target.value })}
                        className="border border-gray-300 rounded-sm px-2 py-0.5 w-14 font-mono focus:outline-none"
                      />
                    </div>
                  )}

                  {mode === "column" && (
                    <div className="text-[10px] text-gray-500">
                      {armedSrc.type === "column" && armedSrc.name ? (
                        <>Sample: <span className="font-mono bg-white/70 px-1.5 py-0.5 rounded">{columnSample(armedSrc.name) ? `"${columnSample(armedSrc.name)}"` : <span className="italic text-gray-400">empty</span>}</span></>
                      ) : (
                        <span className="italic">Click a column header in the grid →</span>
                      )}
                    </div>
                  )}

                  {mode === "cell" && (
                    <div className="text-[10px] text-gray-500 italic">Click any cell in the grid →</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Clickable grid */}
      <div className="lg:col-span-3 space-y-2">
        <div className="flex items-start gap-2 text-[11px] text-[#222222] bg-blue-50 border border-[#222222]/30 rounded px-3 py-2 font-medium">
          <MousePointerClick size={13} className="shrink-0 mt-0.5" />
          <span>
            <strong>{armedLabel}</strong> selected ({MODE_CHIPS.find((c) => c.type === mode)?.label}).{" "}
            {mode === "column" && "Click a column header to assign it."}
            {mode === "concat" && "Click column headers to combine them."}
            {mode === "cell" && "Click any cell to use its exact value."}
            {mode === "fixed" && "This field uses a typed value — no grid click needed."}
            {mode === "none" && "This field is marked as not present — no grid click needed."}
          </span>
        </div>

        <PreviewGrid
          columns={columns}
          activeRows={activeRows}
          headerRow={hRow}
          interactive={gridInteractive}
          isCellClickable={(ri, ci, isHeader) =>
            mode === "cell" ? true : (isHeader && (mode === "column" || mode === "concat"))}
          onCellClick={(ri, ci) => handleCellClick(ri, ci)}
          cellHighlight={(ri, ci, isHeader) => {
            if (mode === "cell") return armedSrc.type === "cell" && armedSrc.row === ri && armedSrc.col === ci;
            if (!isHeader) return false;
            if (mode === "column") return armedSrc.type === "column" && armedSrc.name === columns[ci];
            if (mode === "concat") return armedSrc.type === "concat" && (armedSrc.names ?? []).includes(columns[ci]);
            return false;
          }}
          cellDecoration={(ri, ci, isHeader) => {
            const onCol = isHeader ? fieldsOnColumn(ci) : [];
            const cellField = fieldOnCell(ri, ci);
            if (onCol.length === 0 && !cellField) return null;
            return (
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {onCol.map((f) => (
                  <span key={f} className={`text-[8px] font-black uppercase px-1 py-px rounded-sm ${FIELD_STYLE[f].badge}`}>{FIELD_SHORT[f]}</span>
                ))}
                {cellField && (
                  <span className={`text-[8px] font-black uppercase px-1 py-px rounded-sm ${FIELD_STYLE[cellField].badge}`}>{FIELD_SHORT[cellField]}</span>
                )}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}

// ── Dropdown mode: the original per-field source pickers (fallback) ────────────
function DropdownColumnMapper({ columns, fieldMappings, setFieldMappings, activeRows, headerRow }: ColumnMapperProps) {
  const updateField = (name: LogicalField, src: FieldSource) =>
    setFieldMappings({ ...fieldMappings, [name]: src });

  // Track which fields the user has expanded to the advanced source picker.
  const [advancedFields, setAdvancedFields] = useState<Set<LogicalField>>(new Set());
  const toggleAdvanced = (name: LogicalField) => {
    setAdvancedFields((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // First data row after the header → live sample values for the chosen column.
  const sampleRow = activeRows[(headerRow ?? 0) + 1] ?? [];
  const sampleFor = (colName: string | null | undefined): string => {
    if (!colName) return "";
    const idx = columns.indexOf(colName);
    return idx >= 0 ? (sampleRow[idx] ?? "") : "";
  };

  const SOURCE_TYPE_LABELS: Record<string, string> = {
    column: "A column in the file",
    cell:   "Always in the same cell (metadata)",
    fixed:  "Same value for every row",
    concat: "Combine several columns",
    none:   "Not in this file",
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {LOGICAL_FIELDS.map(({ name, label, required }) => {
          const src = fieldMappings[name];
          const isAdvanced = advancedFields.has(name) || src.type !== "column";
          const sample = src.type === "column" ? sampleFor(src.name) : "";
          return (
            <div
              key={name}
              className="bg-white border border-gray-200 rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-start"
            >
              {/* Left: field name + plain-language help */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-black text-primary uppercase tracking-wider">
                  {label} {required && <span className="text-red-500">*</span>}
                  <span title={FIELD_HELP[name]} className="cursor-help text-gray-300 hover:text-[#222222]">
                    <Info size={12} />
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5 leading-snug pr-2">{FIELD_HELP[name]}</div>
              </div>

              {/* Right: source config */}
              <div className="space-y-2">
                {/* Simple mode — just a column dropdown + live sample */}
                {!isAdvanced && (
                  <>
                    <div className="relative">
                      <select
                        value={src.type === "column" ? (src.name ?? "") : ""}
                        onChange={(e) => updateField(name, { type: "column", name: e.target.value || null })}
                        className="w-full text-xs font-mono border border-gray-300 rounded-sm px-3 py-1.5 appearance-none bg-white pr-7 focus:outline-none focus:border-[#222222]"
                      >
                        <option value="">— Pick the column —</option>
                        {columns.map((c, i) => (
                          <option key={i} value={c}>{c || `Col_${i}`}</option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {src.type === "column" && src.name && (
                      <div className="text-[10px] text-gray-500">
                        Sample from your file:{" "}
                        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                          {sample ? `"${sample}"` : <span className="italic text-gray-400">empty</span>}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleAdvanced(name)}
                      className="text-[10px] text-gray-400 hover:text-[#222222] hover:underline cursor-pointer"
                    >
                      Not a simple column? More options →
                    </button>
                  </>
                )}

                {/* Advanced mode — full source picker */}
                {isAdvanced && (
                <div className="relative">
                  <select
                    value={src.type}
                    onChange={(e) => {
                      const t = e.target.value as FieldSource["type"];
                      if (t === "column") updateField(name, { type: "column", name: null });
                      else if (t === "cell") updateField(name, { type: "cell", row: 1, col: 1 });
                      else if (t === "fixed") updateField(name, { type: "fixed", value: "" });
                      else if (t === "concat") updateField(name, { type: "concat", names: [], sep: " " });
                      else updateField(name, { type: "none" });
                    }}
                    className="w-full text-xs font-bold border border-gray-300 rounded-sm px-3 py-1.5 appearance-none bg-white pr-7 focus:outline-none focus:border-[#222222]"
                  >
                    {Object.entries(SOURCE_TYPE_LABELS).map(([v, lbl]) => (
                      <option key={v} value={v}>{lbl}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                )}

                {/* Type-specific inputs (advanced) */}
                {isAdvanced && src.type === "column" && (
                  <div className="relative">
                    <select
                      value={src.name ?? ""}
                      onChange={(e) => updateField(name, { type: "column", name: e.target.value || null })}
                      className="w-full text-xs font-mono border border-gray-300 rounded-sm px-3 py-1.5 appearance-none bg-white pr-7 focus:outline-none focus:border-[#222222]"
                    >
                      <option value="">— Select column —</option>
                      {columns.map((c, i) => (
                        <option key={i} value={c}>{c || `Col_${i}`}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                )}

                {isAdvanced && src.type === "cell" && (
                  <div className="flex items-center gap-2 text-xs">
                    <label className="text-gray-500 shrink-0">Row</label>
                    <input
                      type="number"
                      min={0}
                      value={src.row ?? 0}
                      onChange={(e) => updateField(name, { ...src, row: Number(e.target.value) })}
                      className="border border-gray-300 rounded-sm px-2 py-1 w-16 font-mono text-xs focus:outline-none focus:border-[#222222]"
                    />
                    <label className="text-gray-500 shrink-0">Col</label>
                    <input
                      type="number"
                      min={0}
                      value={src.col ?? 0}
                      onChange={(e) => updateField(name, { ...src, col: Number(e.target.value) })}
                      className="border border-gray-300 rounded-sm px-2 py-1 w-16 font-mono text-xs focus:outline-none focus:border-[#222222]"
                    />
                    {activeRows[src.row ?? 0]?.[src.col ?? 0] && (
                      <span className="text-[10px] text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                        "{activeRows[src.row ?? 0]?.[src.col ?? 0]}"
                      </span>
                    )}
                  </div>
                )}

                {src.type === "fixed" && (
                  <input
                    type="text"
                    placeholder="Hardcoded value…"
                    value={src.value ?? ""}
                    onChange={(e) => updateField(name, { type: "fixed", value: e.target.value })}
                    className="w-full text-xs border border-gray-300 rounded-sm px-3 py-1.5 font-mono focus:outline-none focus:border-[#222222]"
                  />
                )}

                {src.type === "concat" && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {columns.map((c, i) => {
                        const selected = src.names?.includes(c);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              const curr = src.names ?? [];
                              updateField(name, {
                                ...src,
                                names: selected ? curr.filter((x) => x !== c) : [...curr, c],
                              });
                            }}
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-sm border cursor-pointer ${
                              selected
                                ? "bg-[#222222] text-white border-[#222222]"
                                : "bg-white text-gray-600 border-gray-300 hover:border-[#222222]"
                            }`}
                          >
                            {c || `Col_${i}`}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Separator</span>
                      <input
                        value={src.sep ?? " "}
                        onChange={(e) => updateField(name, { ...src, sep: e.target.value })}
                        className="border border-gray-300 rounded-sm px-2 py-1 w-16 font-mono text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 4 — Credit Rule
// ═══════════════════════════════════════════════════════════════════════════════

function StepCreditRule({
  columns, creditRule, setCreditRule, activeRows, headerRow, subHeaderRow,
}: {
  columns: string[];
  creditRule: CreditRuleConfig;
  setCreditRule: (r: CreditRuleConfig) => void;
  activeRows: string[][];
  headerRow: number | null;
  subHeaderRow: number | null;
}) {
  const hRow = headerRow ?? 0;
  // Data begins after the header AND the optional sub-header row — otherwise the
  // sub-header (e.g. a "Dr / Cr" label row under merged Amount columns) gets
  // tinted as a credit because its cell text is non-blank.
  const dataStart = subHeaderRow != null ? Math.max(hRow, subHeaderRow) : hRow;

  const RULE_OPTIONS: {
    value: CreditRuleConfig["type"];
    title: string;
    question: string;
    columnLabel: string;
    columnHelp: string;
  }[] = [
    {
      value: "column_not_blank",
      title: "My bank statement has separate Debit and Credit columns",
      question: 'Look at your spreadsheet — do you see two separate columns, one labelled something like "Credit" and another "Debit"? If yes, pick this option.',
      columnLabel: "Which column is the Credit amount column?",
      columnHelp: "The column that holds the money received (credited). Any row with a value here is treated as a credit; blank rows are debits and get skipped.",
    },
    {
      value: "amount_positive",
      title: "My bank statement has one Amount column (positive = credit, negative = debit)",
      question: 'Look at your spreadsheet — is there a single "Amount" column where credits show as positive numbers and debits show as negative (with a minus sign or in brackets)?',
      columnLabel: "Which column is the Amount column?",
      columnHelp: "The single signed money column. Positive values are treated as credits; negative values (minus sign or brackets) are debits and get skipped.",
    },
    {
      value: "flag_matches",
      title: "My bank statement has a CR / DR label column",
      question: 'Look at your spreadsheet — is there a column that simply says "CR" or "DR" (or "Credit" / "Debit") next to each row to indicate its type?',
      columnLabel: "Which column contains the CR / DR label?",
      columnHelp: "The flag column that marks each row as credit or debit. Rows flagged CR / Credit are kept; DR / Debit rows are skipped.",
    },
  ];

  const selected = RULE_OPTIONS.find((r) => r.value === creditRule.type);
  const creditColIdx = creditRule.field ? columns.indexOf(creditRule.field) : -1;

  // Client-side approximations that mirror the backend rules, just to tint the
  // preview. The Step 6 Test run remains the source of truth.
  const parseAmount = (raw: string): number | null => {
    const s = (raw ?? "").trim();
    if (!s) return null;
    const neg = /^\(.*\)$/.test(s) || s.includes("-");
    const digits = s.replace(/[^0-9.]/g, "");
    if (!digits) return null;
    const n = parseFloat(digits);
    return Number.isNaN(n) ? null : (neg ? -n : n);
  };
  const flagMatch = (raw: string): boolean => {
    const val = (raw ?? "").trim();
    if (!val) return false;
    let p = creditRule.pattern ?? "(?i)cr";
    const ci = /^\(\?i\)/.test(p);
    p = p.replace(/^\(\?i\)/, "");
    try { return new RegExp(p, ci ? "i" : "").test(val); }
    catch { return val.toLowerCase().includes("cr"); }
  };
  const rowIsCredit = (ri: number): boolean => {
    if (creditColIdx < 0) return false;
    const cell = String(activeRows[ri]?.[creditColIdx] ?? "");
    if (creditRule.type === "column_not_blank") return !!cell.trim();
    if (creditRule.type === "amount_positive") { const n = parseAmount(cell); return n !== null && n > 0; }
    if (creditRule.type === "flag_matches") return flagMatch(cell);
    return false;
  };
  const rowTint = (ri: number): "credit" | "skip" | undefined => {
    if (creditColIdx < 0 || ri <= dataStart) return undefined;
    return rowIsCredit(ri) ? "credit" : "skip";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left: rule choice + column dropdown */}
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h2 className="text-sm font-black text-primary uppercase tracking-wider">How does your bank show credits?</h2>
          <p className="text-xs text-gray-500 mt-1">
            Pick the option that matches your statement, then choose the column that carries it. The preview on the right highlights the rows that rule would keep as credits.
          </p>
        </div>

        {/* rule-type cards */}
        <div className="space-y-2">
          {RULE_OPTIONS.map((opt) => {
            const isSelected = creditRule.type === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
                  isSelected ? "border-[#222222] bg-[#222222]/5" : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="credit_rule_type"
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => {
                    const update: CreditRuleConfig = { type: opt.value, field: creditRule.field };
                    if (opt.value === "flag_matches") update.pattern = "(?i)cr";
                    setCreditRule(update);
                  }}
                  className="mt-0.5 cursor-pointer shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-xs font-black text-primary">{opt.title}</div>
                  <div className="text-[10px] text-gray-500 leading-relaxed">{opt.question}</div>
                </div>
              </label>
            );
          })}
        </div>

        {/* column dropdown */}
        {selected && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-[10px] font-black text-gray-500 uppercase tracking-wider">
              {selected.columnLabel} <span className="text-red-500">*</span>
            </div>
            <p className="text-[10px] text-gray-400 leading-snug">{selected.columnHelp}</p>
            <div className="relative">
              <select
                value={creditRule.field}
                onChange={(e) => setCreditRule({ ...creditRule, field: e.target.value })}
                className="w-full text-xs font-mono border border-gray-300 rounded-sm px-3 py-1.5 appearance-none bg-white pr-7 focus:outline-none focus:border-[#222222]"
              >
                <option value="">— Select a column from your sheet —</option>
                {columns.map((c, i) => (
                  <option key={i} value={c}>{c || `Col_${i}`}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Right: read-only file preview with live credit/skip highlight */}
      <div className="lg:col-span-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">File preview</span>
          <span className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-300" /> Treated as credit</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-300" /> Skipped</span>
          </span>
        </div>
        {creditRule.field
          ? <p className="text-[10px] text-gray-500">Highlighting based on <span className="font-mono">{creditRule.field}</span>. Pick a column to see the effect.</p>
          : <p className="text-[10px] text-gray-400 italic">Select a column on the left to preview which rows are kept.</p>}
        <PreviewGrid
          columns={columns}
          activeRows={activeRows}
          headerRow={hRow}
          rowTint={rowTint}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 5 — Exclusions
// ═══════════════════════════════════════════════════════════════════════════════

function StepExclusions({
  columns, exclusions, setExclusions,
}: {
  columns: string[];
  exclusions: ExclusionRule[];
  setExclusions: (r: ExclusionRule[]) => void;
}) {
  const addRule = () =>
    setExclusions([...exclusions, { type: "field_value_in", field: "", values: [] }]);

  const removeRule = (i: number) =>
    setExclusions(exclusions.filter((_, j) => j !== i));

  const updateRule = (i: number, patch: Partial<ExclusionRule>) =>
    setExclusions(exclusions.map((r, j) => j === i ? { ...r, ...patch } : r));

  const EXCL_TYPES: { value: ExclusionRule["type"]; label: string }[] = [
    { value: "field_value_in",   label: "Field value is one of…"   },
    { value: "field_not_equals", label: "Field does not equal…"    },
    { value: "field_blank",      label: "Field is blank"           },
    { value: "field_matches",    label: "Field matches regex"      },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-black text-primary uppercase tracking-wider">Row Exclusions</h2>
        <p className="text-xs text-gray-500 mt-1">
          Optional. Define which rows to skip before the credit rule is applied (e.g. Opening/Closing Balance rows).
        </p>
      </div>

      {exclusions.length === 0 && (
        <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded p-4 text-center">
          No exclusions defined. This is optional — skip if not needed.
        </div>
      )}

      {exclusions.map((rule, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Rule {i + 1}</span>
            <button onClick={() => removeRule(i)} className="text-gray-400 hover:text-red-500 cursor-pointer">
              <X size={13} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Field */}
            <div className="relative">
              <select
                value={rule.field}
                onChange={(e) => updateRule(i, { field: e.target.value })}
                className="w-full text-xs font-mono border border-gray-300 rounded-sm px-2 py-1.5 appearance-none bg-white pr-6 focus:outline-none"
              >
                <option value="">— Field —</option>
                {columns.map((c, ci) => <option key={ci} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Type */}
            <div className="relative">
              <select
                value={rule.type}
                onChange={(e) => updateRule(i, { type: e.target.value as ExclusionRule["type"] })}
                className="w-full text-xs border border-gray-300 rounded-sm px-2 py-1.5 appearance-none bg-white pr-6 focus:outline-none"
              >
                {EXCL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Value */}
            {rule.type === "field_value_in" && (
              <input
                type="text"
                placeholder="value1, value2 (comma-separated)"
                value={(rule.values ?? []).join(", ")}
                onChange={(e) => updateRule(i, { values: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                className="text-xs font-mono border border-gray-300 rounded-sm px-2 py-1.5 focus:outline-none"
              />
            )}
            {rule.type === "field_not_equals" && (
              <input
                type="text"
                placeholder="Expected value"
                value={rule.value ?? ""}
                onChange={(e) => updateRule(i, { value: e.target.value })}
                className="text-xs font-mono border border-gray-300 rounded-sm px-2 py-1.5 focus:outline-none"
              />
            )}
            {rule.type === "field_matches" && (
              <input
                type="text"
                placeholder="Regex pattern"
                value={rule.pattern ?? ""}
                onChange={(e) => updateRule(i, { pattern: e.target.value })}
                className="text-xs font-mono border border-gray-300 rounded-sm px-2 py-1.5 focus:outline-none"
              />
            )}
            {rule.type === "field_blank" && (
              <div className="text-xs text-gray-400 py-1.5 italic">No value needed</div>
            )}
          </div>
        </div>
      ))}

      <button
        onClick={addRule}
        className="flex items-center gap-1.5 text-xs font-bold text-[#222222] hover:underline cursor-pointer"
      >
        <Plus size={13} /> Add exclusion rule
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 6 — Test Run
// ═══════════════════════════════════════════════════════════════════════════════

function StepTestRun({
  testResult, testLoading, handleTestRun, checks, internalPass, testPassed,
}: {
  testResult: BuilderTestResult | null;
  testLoading: boolean;
  handleTestRun: () => void;
  checks: { label: string; ok: boolean }[];
  internalPass: boolean;
  testPassed: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-black text-primary uppercase tracking-wider">Test Run</h2>
        <p className="text-xs text-gray-500 mt-1">
          Your config must pass an internal check <strong>and</strong> a live parse of the actual
          file before you can save. Fix any failing item below, then run the test.
        </p>
      </div>

      {/* Internal checks */}
      <div className="border border-gray-200 rounded overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 text-[10px] font-black text-gray-500 uppercase tracking-wider">
          Internal check
        </div>
        <div className="divide-y divide-gray-100">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              {c.ok
                ? <Check size={13} className="text-emerald-600 shrink-0" />
                : <AlertCircle size={13} className="text-red-500 shrink-0" />}
              <span className={c.ok ? "text-gray-700" : "text-red-600 font-bold"}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleTestRun}
        disabled={testLoading || !internalPass}
        title={!internalPass ? "Resolve the internal check items above first" : undefined}
        className="flex items-center gap-2 bg-[#222222] hover:bg-[#222222] text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-sm shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {testLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} className="fill-current" />}
        {testLoading ? "Running test…" : "Run Test"}
      </button>

      {testResult && (
        <div className="space-y-3">
          {testResult.success ? (
            <>
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-bold bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded">
                <Check size={16} />
                Found {testResult.row_count.toLocaleString()} credit row{testResult.row_count !== 1 ? "s" : ""}
                {testResult.row_count > 50 && " (showing first 50)"}
              </div>

              {testResult.rows.length > 0 && (
                <div className="border border-gray-200 rounded overflow-auto max-h-72">
                  <table className="text-[11px] w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {["Date", "Narrative", "Amount", "Account", "Currency"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] font-black text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {testResult.rows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-mono whitespace-nowrap">{row.statement_date?.split("T")[0] ?? "—"}</td>
                          <td className="px-3 py-1.5 max-w-[200px] truncate">{row.narrative}</td>
                          <td className="px-3 py-1.5 font-mono text-right whitespace-nowrap">
                            {typeof row.credit_amount === "number"
                              ? row.credit_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })
                              : row.credit_amount}
                          </td>
                          <td className="px-3 py-1.5 font-mono whitespace-nowrap">{row.account_number}</td>
                          <td className="px-3 py-1.5 font-mono">{row.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-2 text-red-700 text-xs bg-red-50 border border-red-200 px-4 py-3 rounded">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-bold mb-1">Test failed</div>
                <div className="font-mono whitespace-pre-wrap text-[11px]">{testResult.error}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {!testResult && !testLoading && (
        <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded p-4">
          Click "Run Test" to validate your configuration against the file. You can only continue to Save once it passes.
        </div>
      )}

      {testPassed ? (
        <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded">
          <Check size={15} /> Config passed — you can continue to Save.
        </div>
      ) : (
        <div className="flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 px-4 py-2.5 rounded">
          <AlertTriangle size={15} /> Run a successful test to unlock the Save step.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 5 — Locate the account number
// ═══════════════════════════════════════════════════════════════════════════════

function StepLocateAccount({
  columns, activeRows, headerRow, accountLocator, setAccountLocator,
  foundAccounts, existingFormats, accountNumber, setAccountNumber,
  locating, locateError, handleLocate, extension,
}: {
  columns: string[];
  activeRows: string[][];
  headerRow: number | null;
  accountLocator: AccountLocator;
  setAccountLocator: (l: AccountLocator) => void;
  foundAccounts: string[];
  existingFormats: Record<string, string[]>;
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  locating: boolean;
  locateError: string;
  handleLocate: () => void;
  extension: string;
}) {
  const t = accountLocator.type;
  const fmt = extension === "txt" ? "csv" : extension === "xlsm" ? "xlsx" : extension;
  const [viewMode, setViewMode] = useState<"preview" | "dropdown">("preview");
  const hRow = headerRow ?? 0;
  const cellValue = String(activeRows[accountLocator.row ?? 0]?.[accountLocator.col ?? 0] ?? "");

  return (
    <div className="space-y-3">
      {/* header + mode toggle */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-primary uppercase tracking-wider">Where is the account number?</h2>
          <p className="text-xs text-gray-500 mt-1">
            The account number is how this bank statement is recognised — filenames are ignored. Tell us where it appears, then click <strong>Find account</strong>.
          </p>
        </div>
        <div className="flex items-center bg-gray-100 rounded-md p-0.5 shrink-0">
          {([["preview", "Pick from preview"], ["dropdown", "Use dropdowns"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewMode(v)}
              className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-sm cursor-pointer transition-colors ${
                viewMode === v ? "bg-white text-primary shadow-xs" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT: locator controls, Find button, results */}
        <div className="lg:col-span-2 space-y-3">
          {/* locator type */}
          <div className="flex flex-wrap gap-2">
            {([
              { v: "cell",   label: "In a fixed cell" },
              { v: "column", label: "In a column (one per row)" },
              { v: "regex",  label: "Inside a text column (pattern)" },
            ] as const).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => {
                  if (o.v === "cell") setAccountLocator({ type: "cell", row: 0, col: 1 });
                  else if (o.v === "column") setAccountLocator({ type: "column", name: columns[0] ?? "" });
                  else setAccountLocator({ type: "regex", in: { type: "column", name: columns[0] ?? "" }, pattern: AUTO_ACCOUNT_REGEX });
                }}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-sm border cursor-pointer ${
                  t === o.v ? "bg-[#222222] text-white border-[#222222]" : "bg-white text-gray-600 border-gray-300 hover:border-[#222222]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* input area */}
          <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2 text-xs">
            {viewMode === "dropdown" ? (
              <>
                {t === "cell" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-gray-500">Row</label>
                    <input type="number" min={0} value={accountLocator.row ?? 0}
                      onChange={(e) => setAccountLocator({ ...accountLocator, row: Number(e.target.value) })}
                      className="border border-gray-300 rounded-sm px-2 py-1 w-16 font-mono" />
                    <label className="text-gray-500">Col</label>
                    <input type="number" min={0} value={accountLocator.col ?? 0}
                      onChange={(e) => setAccountLocator({ ...accountLocator, col: Number(e.target.value) })}
                      className="border border-gray-300 rounded-sm px-2 py-1 w-16 font-mono" />
                    {cellValue && (
                      <span className="text-[10px] text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[140px]">
                        &quot;{cellValue}&quot;
                      </span>
                    )}
                  </div>
                )}
                {t === "column" && (
                  <div className="flex items-center gap-2">
                    <label className="text-gray-500">Column</label>
                    <select value={accountLocator.name ?? ""}
                      onChange={(e) => setAccountLocator({ ...accountLocator, name: e.target.value })}
                      className="border border-gray-300 rounded-sm px-2 py-1 font-mono text-xs">
                      <option value="">— pick —</option>
                      {columns.map((c, i) => <option key={i} value={c}>{c || `Col_${i}`}</option>)}
                    </select>
                  </div>
                )}
                {t === "regex" && (
                  <div className="flex items-center gap-2">
                    <label className="text-gray-500">In column</label>
                    <select value={accountLocator.in?.name ?? ""}
                      onChange={(e) => setAccountLocator({ ...accountLocator, in: { type: "column", name: e.target.value } })}
                      className="border border-gray-300 rounded-sm px-2 py-1 font-mono text-xs">
                      <option value="">— pick —</option>
                      {columns.map((c, i) => <option key={i} value={c}>{c || `Col_${i}`}</option>)}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-start gap-2 text-[11px] text-[#222222] font-medium">
                  <MousePointerClick size={13} className="shrink-0 mt-0.5" />
                  <span>
                    {t === "cell"   && "Click the cell in the preview that holds the account number (incl. rows above the header)."}
                    {t === "column" && "Click the column header in the preview that holds the account number — one per row."}
                    {t === "regex"  && "Click the text column header in the preview to scan for account-like values inside it."}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">
                  {t === "cell" && (accountLocator.row !== undefined
                    ? <>Selected: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">R{accountLocator.row}·C{accountLocator.col}{cellValue ? ` → "${cellValue}"` : ""}</span></>
                    : <span className="italic">No cell selected yet.</span>)}
                  {t === "column" && (accountLocator.name
                    ? <>Column: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{accountLocator.name}</span></>
                    : <span className="italic">No column selected yet.</span>)}
                  {t === "regex" && (accountLocator.in?.name
                    ? <>Scanning column: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{accountLocator.in.name}</span></>
                    : <span className="italic">No column selected yet.</span>)}
                </div>
              </>
            )}

            {/* regex explainer — shown in both modes since detection is automatic */}
            {t === "regex" && (
              <div className="flex items-start gap-2 text-[10px] text-gray-500 bg-white border border-gray-200 rounded p-2">
                <Info size={12} className="shrink-0 mt-0.5 text-[#222222]" />
                <span>
                  We automatically detect account-number-like values inside this column —
                  numeric (e.g. <span className="font-mono">000205024781</span>) and
                  alphanumeric / IBAN-style (e.g. <span className="font-mono">GB29NWBK…</span>),
                  even when buried in text like “… (INR) - 000205024781”. Pick the column,
                  click <strong>Find account</strong>, then choose the right one below.
                </span>
              </div>
            )}

            <button type="button" onClick={handleLocate} disabled={locating}
              className="flex items-center gap-2 bg-[#222222] hover:bg-[#222222] text-white text-[11px] font-black uppercase tracking-wider px-4 py-2 rounded-sm cursor-pointer disabled:opacity-50">
              {locating ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} className="fill-current" />}
              Find account
            </button>
          </div>

          {locateError && (
            <div className="flex items-center gap-2 text-red-700 text-xs bg-red-50 border border-red-200 px-3 py-2 rounded">
              <AlertCircle size={14} /> {locateError}
            </div>
          )}

          {/* results */}
          {foundAccounts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                Found {foundAccounts.length} account{foundAccounts.length === 1 ? "" : "s"} — pick the one this config is for
              </div>
              <div className="space-y-1.5">
                {foundAccounts.map((a) => {
                  const exists = existingFormats[a];
                  return (
                    <label key={a} className={`flex flex-wrap items-center gap-2 border rounded p-2 cursor-pointer ${accountNumber === a ? "border-[#222222] bg-[#222222]/5" : "border-gray-200"}`}>
                      <input type="radio" name="acct" checked={accountNumber === a} onChange={() => setAccountNumber(a)} />
                      <span className="font-mono text-xs font-bold text-primary">{a}</span>
                      {exists && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-xs">
                          <AlertTriangle size={10} /> exists ({exists.join(", ")})
                          {exists.includes(fmt) ? ` — saving adds a new ${fmt} version` : ` — this adds a ${fmt} recipe`}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {accountNumber && (
            <div className="text-xs text-gray-600">
              This config will be keyed to account <span className="font-mono font-bold">{accountNumber}</span>.
            </div>
          )}
        </div>

        {/* RIGHT: preview grid (clickable only in preview mode) */}
        <div className="lg:col-span-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">File preview</span>
            {viewMode === "preview" && (
              <span className="text-[10px] text-[#222222] font-medium flex items-center gap-1">
                <MousePointerClick size={11} /> click to select
              </span>
            )}
          </div>
          <PreviewGrid
            columns={columns}
            activeRows={activeRows}
            headerRow={hRow}
            isCellClickable={(ri, ci, isHeader) => viewMode === "preview" && (t === "cell" ? true : isHeader)}
            onCellClick={(ri, ci, isHeader) => {
              if (t === "cell") setAccountLocator({ type: "cell", row: ri, col: ci });
              else if (isHeader && t === "column") setAccountLocator({ type: "column", name: columns[ci] });
              else if (isHeader && t === "regex") setAccountLocator({ type: "regex", in: { type: "column", name: columns[ci] }, pattern: accountLocator.pattern ?? AUTO_ACCOUNT_REGEX });
            }}
            cellHighlight={(ri, ci, isHeader) => {
              if (t === "cell") return accountLocator.row === ri && accountLocator.col === ci;
              if (isHeader && t === "column") return accountLocator.name === columns[ci];
              if (isHeader && t === "regex") return accountLocator.in?.name === columns[ci];
              return false;
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 7 — Save
// ═══════════════════════════════════════════════════════════════════════════════

function StepSave({
  displayName, setDisplayName,
  bank, setBank, currency, setCurrency,
  ouNumber, setOuNumber, businessUnit, setBusinessUnit,
  functionalCurrency, setFunctionalCurrency,
  accountNumber, existingFormats,
  extension,
  saving, saveError,
  availableOUs, ousLoading, ousError,
}: {
  displayName: string; setDisplayName: (v: string) => void;
  bank: string; setBank: (v: string) => void;
  currency: string; setCurrency: (v: string) => void;
  ouNumber: string; setOuNumber: (v: string) => void;
  businessUnit: string; setBusinessUnit: (v: string) => void;
  functionalCurrency: string; setFunctionalCurrency: (v: string) => void;
  accountNumber: string;
  existingFormats: Record<string, string[]>;
  extension: string;
  saving: boolean; saveError: string;
  availableOUs: { ou_number: string; business_unit: string | null }[];
  ousLoading: boolean;
  ousError: string;
}) {
  const exists = existingFormats[accountNumber];
  const selectedOU = availableOUs.find((o) => o.ou_number === ouNumber);
  const isKnownOU = !!selectedOU?.business_unit;

  const handleOuChange = (value: string) => {
    setOuNumber(value);
    const match = availableOUs.find((o) => o.ou_number === value);
    // Known OU -> auto-fill its Business Unit name. New OU (from the aging
    // report, not yet onboarded) -> clear it so the person names it once.
    setBusinessUnit(match?.business_unit || "");
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h2 className="text-sm font-black text-primary uppercase tracking-wider">Save Config</h2>
        <p className="text-xs text-gray-500 mt-1">
          This config is keyed to account <span className="font-mono font-bold">{accountNumber || "—"}</span>
          {exists ? ` (already has: ${exists.join(", ")})` : ""}. Bank and Currency are pre-filled from your
          column mapping — edit if needed. All fields are required.
        </p>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 text-red-700 text-xs bg-red-50 border border-red-200 px-3 py-2.5 rounded">
          <AlertCircle size={14} /> {saveError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Bank / Statement Name <span className="text-red-500">*</span></label>
          <input type="text" placeholder="e.g. HSBC — USD (SoCal)" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded-sm px-3 py-2 focus:outline-none focus:border-[#222222]" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Bank <span className="text-red-500">*</span></label>
          <input type="text" placeholder="e.g. HSBC" value={bank} onChange={(e) => setBank(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded-sm px-3 py-2 focus:outline-none focus:border-[#222222]" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Currency <span className="text-red-500">*</span></label>
          <input type="text" placeholder="e.g. USD" value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded-sm px-3 py-2 focus:outline-none focus:border-[#222222]" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Organization Unit <span className="text-red-500">*</span></label>
          {ousLoading ? (
            <div className="text-xs text-gray-400 flex items-center gap-1.5 px-3 py-2">
              <Loader2 size={12} className="animate-spin" /> Loading OUs…
            </div>
          ) : ousError ? (
            <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              Couldn't load Organization Units: {ousError}
            </div>
          ) : availableOUs.length === 0 ? (
            <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
              No OUs available yet — load an aging report first so its Organization Units show up here.
            </div>
          ) : (
            <select value={ouNumber} onChange={(e) => handleOuChange(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-sm px-3 py-2 focus:outline-none focus:border-[#222222] bg-white">
              <option value="">Select an OU…</option>
              {availableOUs.map((o) => (
                <option key={o.ou_number} value={o.ou_number}>
                  {o.ou_number}{o.business_unit ? ` — ${o.business_unit}` : " — (new, not yet onboarded)"}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
            Business Unit <span className="text-red-500">*</span>
            {isKnownOU && <span className="text-gray-400 font-normal normal-case"> (from OU record)</span>}
          </label>
          <input type="text" placeholder="e.g. SoCal BU" value={businessUnit}
            onChange={(e) => setBusinessUnit(e.target.value)}
            readOnly={isKnownOU}
            className={`w-full text-xs border border-gray-300 rounded-sm px-3 py-2 focus:outline-none focus:border-[#222222] ${isKnownOU ? "bg-gray-50 text-gray-500" : ""}`} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
            Functional (Ledger) Currency <span className="text-gray-400 font-normal">— optional</span>
          </label>
          <input type="text" placeholder={`defaults to ${currency || "the account currency"}`} value={functionalCurrency} onChange={(e) => setFunctionalCurrency(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded-sm px-3 py-2 focus:outline-none focus:border-[#222222]" />
        </div>
      </div>

      <div className="text-[10px] text-gray-400 flex items-center gap-1.5">
        <Info size={11} /> Organization Unit and Business Unit are a required relationship for this account — chosen from your Organization Units, not free-typed. Only set Functional Currency if OU {ouNumber || "…"} is genuinely new — if it already exists, its current currency is kept as-is. File type: <span className="font-mono">{extension}</span>.
      </div>

      {saving && (
        <div className="flex items-center gap-2 text-gray-500 text-xs">
          <Loader2 size={14} className="animate-spin" /> Saving config and triggering hot-reload…
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════════

function SheetTabs({
  sheets, selected, onChange,
}: {
  sheets: { name: string }[];
  selected: string;
  onChange: (s: string) => void;
}) {
  if (sheets.length <= 1) return null;
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {sheets.map((s) => (
        <button
          key={s.name}
          onClick={() => onChange(s.name)}
          className={`px-3 py-1.5 text-[11px] font-bold border-b-2 cursor-pointer transition-colors ${
            selected === s.name
              ? "border-[#222222] text-[#222222]"
              : "border-transparent text-gray-400 hover:text-primary"
          }`}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

function RawGrid({ rows }: { rows: string[][] }) {
  if (rows.length === 0) {
    return <div className="text-xs text-gray-400 py-6 text-center">No data in this sheet.</div>;
  }
  const maxCols = Math.max(...rows.map((r) => r.length));
  return (
    <div className="border border-gray-200 rounded overflow-auto max-h-80">
      <table className="text-[11px] font-mono w-full border-collapse">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-200 sticky top-0">
            <th className="w-8 px-2 py-1.5 text-center text-[10px] font-bold text-gray-400 border-r border-gray-200 select-none">#</th>
            {Array.from({ length: maxCols }, (_, i) => (
              <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-400 border-r border-gray-100 text-left">{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-50 border-b border-gray-100">
              <td className="px-2 py-1 text-center text-[10px] text-gray-400 font-bold border-r border-gray-200 bg-gray-50">{ri}</td>
              {Array.from({ length: maxCols }, (_, ci) => (
                <td key={ci} className="px-2 py-1 border-r border-gray-100 whitespace-nowrap max-w-[160px] truncate text-gray-700">
                  {row[ci] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}