"use client";
/**
 * app/home/components/ConfirmRunDialog.tsx
 * ============================================
 * The last — and only — point at which a wrong analysis run can be caught.
 *
 * An analysis run is IRREVERSIBLE by design: the orchestrator stamps
 * consumed_by_run_id on every row it processes, and POST /run/start refuses
 * to run an account that has no unconsumed rows left. There is no undo and
 * no re-run; a mistake has to be corrected row-by-row through HITL instead.
 * So this dialog isn't a "are you sure?" speed bump — it's a full preflight
 * review of everything that will shape the results, fetched fresh from
 * GET /api/run/preflight (bff/run_routes.py) at the moment it opens.
 *
 * Visual system
 * -------------
 * The base app theme is near-monochrome (primary = #222 on white), which
 * left every value the same weight — the crucial numbers merged into the
 * labels around them. So this dialog assigns MEANING to colour, and uses it
 * sparingly on the values that decide whether the run is right:
 *   emerald → money (incoming totals, AI reachable): the "how much" figures
 *   indigo  → routing identity (Business Unit / OU, functional currency):
 *             a wrong one silently mis-posts to Oracle
 *   amber   → warnings / degraded results / FX mismatch / missing config
 *   red     → hard blockers + the irreversibility of the action itself
 * Everything else stays neutral so the coloured values actually stand out.
 *
 * The payload is authoritative: the backend re-derives the account grouping
 * from the selected filenames and its blockers mirror what /start rejects.
 * Nothing here mutates; POST /run/start fires only from onConfirm, and only
 * once the cannot-be-undone checkbox is ticked.
 */
import { useState } from "react";
import {
  AlertTriangle, Ban, Building2, CalendarRange, Coins, CreditCard, FileSpreadsheet,
  Filter, Globe, History, Landmark, Loader2, Play, RefreshCw, ScrollText, ShieldAlert,
  Sparkles, Table2, Users, X,
} from "lucide-react";
import type { RunPreflight, PreflightAccount, PreflightSettlementIdentifier } from "../types";

/** Money in the account's own statement currency. Falls back gracefully when
 *  the statement carries a non-ISO currency code that Intl can't format. */
function fmtAmount(v: number | null, currency: string | null): string {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat(undefined,
      currency ? { style: "currency", currency, maximumFractionDigits: 2 }
               : { maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${currency ? currency + " " : ""}${v.toLocaleString()}`;
  }
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateRange(from: string | null, to: string | null): string | null {
  const a = fmtDate(from), b = fmtDate(to);
  if (!a && !b) return null;
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a ?? b;
}

/** Relative age, e.g. "6 days ago" — for how stale the aging report / a prior
 *  run is. Coarse by design; the exact date is available on hover elsewhere. */
function fmtAge(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** Section heading with a coloured accent bar so the review's zones read as
 *  distinct bands instead of one continuous gray wall. */
function SectionTitle({
  children, hint, accent = "bg-gray-300",
}: { children: React.ReactNode; hint?: string; accent?: string }) {
  return (
    <div className="pt-1 flex items-start gap-2">
      <span className={`w-1 self-stretch rounded-full ${accent} mt-0.5`} />
      <div>
        <div className="text-[11px] font-black uppercase tracking-wider text-primary">{children}</div>
        {hint && <div className="text-[10px] text-gray-400 font-medium mt-0.5 leading-snug">{hint}</div>}
      </div>
    </div>
  );
}

/** A headline metric in the scope band — big value, tiny label. `accent`
 *  colours the value (money → emerald) so the figures that matter pop. */
function StatTile({
  label, value, sub, accent = "text-primary",
}: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-sm bg-white border border-gray-200 px-3 py-2 min-w-0">
      <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-0.5 text-sm font-black tabular-nums leading-tight truncate ${accent}`} title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-400 font-medium truncate">{sub}</div>}
    </div>
  );
}

/** One field in a details grid: tiny uppercase label above a value. Keeps
 *  label/value from merging into one gray run. */
function Field({
  label, children, valueClass = "text-gray-900",
}: { label: string; children: React.ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-[11px] font-bold leading-tight ${valueClass}`}>{children}</div>
    </div>
  );
}

/**
 * One settlement-identifier group (third-party providers, or card/cheque
 * narratives), rendered as wrapping chips inside a fixed-height scroll box.
 * These lists are GLOBAL config and can grow to dozens of entries, so the
 * box caps its own height and scrolls rather than pushing the dialog's
 * action buttons off-screen — the count stays visible in the label even when
 * the chips are scrolled.
 */
function IdentifierGroup({
  icon: Icon, label, items, render, emptyWarn,
}: {
  icon: React.ElementType;
  label: string;
  items: PreflightSettlementIdentifier[];
  render: (i: PreflightSettlementIdentifier) => string;
  emptyWarn?: boolean;
}) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-gray-400 shrink-0" />
        <span className="text-[11px] text-gray-600 font-bold">{label}</span>
        <span className={`text-[10px] font-black tabular-nums rounded-full px-1.5 min-w-[18px] text-center ${
          items.length ? "text-indigo-700 bg-indigo-50" : "text-gray-400 bg-gray-100"
        }`}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <span className={`text-[11px] font-bold pl-[18px] ${emptyWarn ? "text-amber-700" : "text-gray-400"}`}>
          None configured
        </span>
      ) : (
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pl-[18px]">
          {items.map((i) => (
            <span
              key={i.id}
              title={render(i)}
              className="inline-block text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-xs max-w-[220px] truncate"
            >
              {render(i)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** One label/value line in the global-context block. Values are darkened and
 *  tone-coloured (good → emerald, warn → amber) so status reads at a glance. */
function ContextRow({
  icon: Icon, label, value, tone = "normal",
}: {
  icon: React.ElementType; label: string; value: React.ReactNode;
  tone?: "normal" | "warn" | "good";
}) {
  const iconClass = tone === "warn" ? "text-amber-500" : tone === "good" ? "text-emerald-500" : "text-gray-400";
  const valueClass = tone === "warn" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-gray-900";
  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <Icon size={13} className={`shrink-0 mt-0.5 ${iconClass}`} />
      <div className="min-w-0 flex-1 flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-gray-500 font-medium shrink-0">{label}</span>
        <span className={`text-[11px] text-right font-bold ${valueClass}`}>{value}</span>
      </div>
    </div>
  );
}

function AccountRow({ account: g }: { account: PreflightAccount }) {
  const fxMismatch = !!g.account_currency && g.account_currency !== g.functional_currency;
  return (
    <div className="px-3 py-3 space-y-2">
      {/* Header: identity (left) + routing badge (right, indigo when set) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Landmark size={14} className="text-gray-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-black text-primary text-sm truncate leading-tight">{g.bank_name}</div>
            <div className="font-mono text-[10px] text-gray-400 truncate">
              {g.account_number || "—"} &middot; {g.files.length} file{g.files.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        {g.business_unit && g.ou_number ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-xs shrink-0">
            <Building2 size={10} className="text-indigo-400" />
            {/* The Oracle "BusinessUnit" string, verbatim -- NAME(ou), the exact
                value fusion_client.py sends and Oracle exact-matches. Rendered
                font-mono with normal-case on purpose: the badge's `uppercase`
                would show a case-folded version of a string where case is
                load-bearing, which is the opposite of the point. Same
                presentation as the "Oracle BusinessUnit String" column on the
                Accounts & OUs page. */}
            <span className="font-mono normal-case">{g.business_unit}({g.ou_number})</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-300 px-2 py-1 rounded-xs shrink-0">
            <AlertTriangle size={10} /> No Business Unit
          </span>
        )}
      </div>

      {/* Metrics band — the "what this run commits" numbers, set apart in
          their own tinted strip so they don't blend into the config text. */}
      <div className="grid grid-cols-3 gap-2 rounded-sm bg-gray-50 border border-gray-100 px-2.5 py-2">
        <Field label="Pending rows">
          <span className="tabular-nums text-primary">{g.pending_row_count}</span>
        </Field>
        <Field label="Incoming" valueClass="text-emerald-600">
          {g.pending_credit_total != null
            ? <span className="tabular-nums">{fmtAmount(g.pending_credit_total, g.account_currency)}</span>
            : <span className="text-gray-400">—</span>}
        </Field>
        <Field label="Period" valueClass="text-gray-700">
          {fmtDateRange(g.pending_date_from, g.pending_date_to)
            ? <span className="inline-flex items-center gap-1"><CalendarRange size={10} className="text-gray-400" />{fmtDateRange(g.pending_date_from, g.pending_date_to)}</span>
            : <span className="text-gray-400">undated</span>}
        </Field>
      </div>

      {/* Config details — functional currency + credit rule are the two that
          silently corrupt a run if wrong, so they're labelled fields, not
          prose. */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Functional currency" valueClass={g.functional_currency ? "" : "text-red-600"}>
          {g.functional_currency
            ? <span className="font-mono text-indigo-700">{g.functional_currency}</span>
            : "not set"}
          {fxMismatch && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.5 rounded-xs align-middle">
              FX {g.account_currency}→{g.functional_currency}
            </span>
          )}
        </Field>
        <Field label="Last analysed" valueClass="text-gray-500">
          {g.last_run_id != null ? (
            <span title={fmtDate(g.last_run_at) || undefined} className="inline-flex items-center gap-1">
              <History size={10} className="text-gray-400" />
              run #{g.last_run_id}{fmtAge(g.last_run_at) ? ` · ${fmtAge(g.last_run_at)}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-gray-400"><History size={10} />Not analysed before</span>
          )}
        </Field>
      </div>

      {/* The credit rule decides which rows even COUNT as incoming money —
          get it wrong and the run silently skips real receipts. */}
      <div>
        <div className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-0.5">Credit rule</div>
        {g.credit_rules.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
            <Filter size={11} className="text-amber-500" />
            No credit rule found for these file format(s)
          </span>
        ) : (
          g.credit_rules.map((r) => (
            <div key={r.format} className="flex items-start gap-1.5 text-[11px] text-gray-700">
              <Filter size={11} className="text-gray-400 shrink-0 mt-0.5" />
              <span>
                <span className="font-mono uppercase text-gray-500 font-bold">{r.format}</span>
                <span className="text-gray-400"> v{r.recipe_version}</span>
                {" — "}
                {r.credit_rule
                  ? r.credit_rule.description
                  : <span className="text-amber-700 font-bold">recipe has no credit rule</span>}
              </span>
            </div>
          ))
        )}
      </div>

      {/* A multi-BU account is resolved against its FULL OU set at run time —
          showing only the primary would understate the run's reach. */}
      {g.additional_business_units.length > 0 && (
        <div className="text-[10px] text-gray-500">
          <span className="font-black uppercase tracking-wider text-gray-400">Also posts for: </span>
          {/* Same Oracle NAME(ou) form as the primary badge above -- these are
              equally real posting targets, so they read identically. */}
          <span className="font-mono">
            {g.additional_business_units.map((o) => `${o.ou_name}(${o.ou_number})`).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

export default function ConfirmRunDialog({
  preflight,
  preflightLoading,
  preflightError,
  loading,
  onCancel,
  onConfirm,
  onRetryPreflight,
}: {
  preflight: RunPreflight | null;
  preflightLoading: boolean;
  preflightError: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onRetryPreflight: () => void;
}) {
  // Deliberately unticked every time the dialog opens (component is
  // unmounted on close), so a person can never carry a prior acknowledgment
  // into a different run.
  const [acknowledged, setAcknowledged] = useState(false);

  const busy = loading || preflightLoading;
  const blockers = preflight?.blockers ?? [];
  const warnings = preflight?.warnings ?? [];
  const totals = preflight?.totals;
  const ctx = preflight?.context;
  const providers = ctx?.settlement_identifiers.third_party_provider ?? [];
  const cards     = ctx?.settlement_identifiers.card_narrative ?? [];
  const cheques   = ctx?.settlement_identifiers.cheque_narrative ?? [];
  const currencies = totals ? Object.entries(totals.credit_by_currency) : [];

  // Start is gated on three independent things: preflight loaded cleanly, the
  // backend says it can start, and the person ticked the irreversibility
  // checkbox. Any missing piece leaves the button disabled.
  const canConfirm = !!preflight && preflight.can_start && acknowledged && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div className="bg-white rounded-sm shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-primary rounded-t-sm">
          <h3 className="flex items-center gap-2 text-xs font-black text-white uppercase tracking-wider">
            <Play size={13} className="text-emerald-400" />
            Review &amp; Confirm Analysis Run
          </h3>
          <button
            onClick={() => !busy && onCancel()}
            className="text-gray-400 hover:text-white cursor-pointer disabled:opacity-40"
            disabled={busy}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {preflightLoading && (
            <div className="flex items-center gap-2 py-8 justify-center text-[11px] text-gray-500 font-medium">
              <Loader2 size={14} className="animate-spin text-gray-400" />
              Checking this run…
            </div>
          )}

          {!preflightLoading && preflightError && (
            <div className="bg-red-50 border-l-2 border-red-500 p-3 text-[11px] rounded-r-sm space-y-2">
              <div className="flex items-start gap-2">
                <ShieldAlert size={13} className="text-red-600 shrink-0 mt-0.5" />
                <span className="text-gray-700">
                  Couldn&apos;t check this run: {preflightError} Starting without a completed check is
                  blocked, since a run can&apos;t be undone.
                </span>
              </div>
              <button
                type="button"
                onClick={onRetryPreflight}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-red-700 hover:text-red-900 cursor-pointer"
              >
                <RefreshCw size={11} /> Retry check
              </button>
            </div>
          )}

          {!preflightLoading && !preflightError && preflight && (
            <>
              {/* ── Scope headline — the at-a-glance summary ──────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatTile
                  label="Pending rows"
                  value={totals!.pending_rows.toLocaleString()}
                  sub={totals!.duplicate_rows_ignored > 0
                    ? `${totals!.duplicate_rows_ignored} dup ignored`
                    : undefined}
                />
                <StatTile
                  label="Accounts"
                  value={totals!.runnable_accounts.toLocaleString()}
                  sub={`from ${totals!.statements} statement${totals!.statements === 1 ? "" : "s"}`}
                />
                <StatTile
                  label="Incoming"
                  accent="text-emerald-600"
                  value={
                    currencies.length === 0 ? "—"
                      : currencies.length === 1
                        ? fmtAmount(currencies[0][1], currencies[0][0] === "—" ? null : currencies[0][0])
                        : `${currencies.length} currencies`
                  }
                  sub={currencies.length > 1
                    ? currencies.map(([cur, amt]) => fmtAmount(amt, cur === "—" ? null : cur)).join(" · ")
                    : undefined}
                />
                <StatTile
                  label="Period"
                  value={fmtDateRange(totals!.date_from, totals!.date_to) || "undated"}
                />
              </div>

              {/* ── Blockers — cannot proceed ─────────────────────────── */}
              {blockers.map((b) => (
                <div key={b.code} className="bg-red-50 border-l-4 border-red-500 p-2.5 text-[11px] flex items-start gap-2 rounded-r-sm">
                  <Ban size={14} className="text-red-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">
                    <strong className="text-red-700 font-black uppercase tracking-wide">Cannot start — </strong>
                    {b.message}
                  </span>
                </div>
              ))}

              {/* ── Warnings — will proceed, results degraded ─────────── */}
              {warnings.map((w) => (
                <div key={w.code} className="bg-amber-50 border-l-4 border-amber-400 p-2.5 text-[11px] flex items-start gap-2 rounded-r-sm">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">{w.message}</span>
                </div>
              ))}

              {/* A run can't take a subset of one file, so every account in a
                  multi-account statement goes together whether intended or not. */}
              {preflight.multi_account_files.length > 0 && (
                <div className="bg-gray-50 border-l-4 border-gray-300 p-2.5 text-[11px] flex items-start gap-2 rounded-r-sm">
                  <FileSpreadsheet size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <span className="text-gray-700">
                    {preflight.multi_account_files.length === 1 ? (
                      <>
                        <span className="font-mono text-[10px]">{preflight.multi_account_files[0]}</span>{" "}
                        holds rows for <strong>several accounts</strong>.
                      </>
                    ) : (
                      <>
                        <strong>{preflight.multi_account_files.length} statements</strong> hold rows for
                        several accounts each.
                      </>
                    )}{" "}
                    A run can&apos;t take part of a file — every account listed below is processed
                    together, each row against its own account and Organization Unit.
                  </span>
                </div>
              )}

              {/* ── Accounts — statement-specific (the crucial review) ── */}
              <SectionTitle accent="bg-indigo-400" hint="Resolved from the selected statements — specific to this run.">
                Accounts in this run
              </SectionTitle>
              <div className="border border-gray-200 rounded-sm divide-y divide-gray-100">
                {preflight.accounts.map((g) => <AccountRow key={g.key} account={g} />)}
              </div>

              {/* ── Global configuration — recedes vs the account block; it's
                   reference context, not the per-run action data. Labelled
                   as system-wide because the settlement identifiers below
                   otherwise read as if DETECTED in this statement. */}
              <SectionTitle accent="bg-gray-300" hint="Configured system-wide and applied to every run — not detected in these statements.">
                Global configuration
              </SectionTitle>
              <div className="border border-gray-200 rounded-sm divide-y divide-gray-100 bg-gray-50/40">
                <ContextRow
                  icon={Table2}
                  label="Aging report"
                  tone={ctx!.aging.loaded ? "normal" : "warn"}
                  value={
                    ctx!.aging.loaded
                      ? <>{ctx!.aging.filename || "loaded"}{" "}
                          <span className="text-gray-400 font-normal">
                            ({ctx!.aging.row_count.toLocaleString()} rows
                            {fmtAge(ctx!.aging.loaded_at) ? `, loaded ${fmtAge(ctx!.aging.loaded_at)}` : ""})
                          </span></>
                      : "Not loaded"
                  }
                />
                <ContextRow
                  icon={Sparkles}
                  label="AI extraction"
                  tone={ctx!.ai.enabled && ctx!.ai.active ? "good" : "warn"}
                  value={
                    !ctx!.ai.enabled ? "Off — regex only"
                      : ctx!.ai.active ? <>Active <span className="text-gray-400 font-normal">({ctx!.ai.model || ctx!.ai.provider})</span></>
                      : "Unavailable"
                  }
                />
                <ContextRow
                  icon={Coins}
                  label="Short-payment tolerance"
                  value={<span className="tabular-nums">{ctx!.tolerances.short_payment_tolerance_pct}%</span>}
                />
              </div>

              {/* Settlement identifiers — their own labelled block so it's
                  unambiguous these are a GLOBAL roster, checked against every
                  payment, not what was found in this statement. */}
              <SectionTitle accent="bg-gray-300" hint="A global roster checked against every payment in every run.">
                <span className="inline-flex items-center gap-1">
                  <Globe size={12} className="text-gray-400" /> Registered settlement identifiers
                </span>
              </SectionTitle>
              <div className="border border-gray-200 rounded-sm divide-y divide-gray-100 bg-gray-50/40">
                <IdentifierGroup
                  icon={Users}
                  label="Third-party providers"
                  items={providers}
                  emptyWarn
                  render={(p) => p.provider_name || `#${p.id}`}
                />
                <IdentifierGroup
                  icon={CreditCard}
                  label="Card narratives"
                  items={cards}
                  render={(c) => c.pattern || `#${c.id}`}
                />
                <IdentifierGroup
                  icon={ScrollText}
                  label="Cheque narratives"
                  items={cheques}
                  render={(c) => c.pattern || `#${c.id}`}
                />
              </div>

              {/* ── Irreversibility ──────────────────────────────────── */}
              <div className="bg-red-50 border border-red-300 rounded-sm p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <ShieldAlert size={16} className="text-red-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-gray-700 space-y-1">
                    <div className="font-black uppercase tracking-wider text-red-700 text-[11px]">
                      This cannot be undone
                    </div>
                    <p>
                      Starting this run permanently marks its{" "}
                      <strong className="text-red-700">{totals!.pending_rows} row{totals!.pending_rows === 1 ? "" : "s"}</strong> as
                      processed. An analysis <strong className="text-red-700">cannot be re-run or reverted</strong> — re-uploading
                      the same statement afterwards will be refused as already analysed, and anything that
                      comes out wrong has to be corrected row by row in Review, not by running again.
                    </p>
                    <p className="text-gray-500">
                      Check the Business Unit, functional currency and credit rule for every account above
                      before continuing. A wrong Business Unit makes Oracle reject every receipt for that
                      account; a wrong credit rule silently skips real receipts.
                    </p>
                  </div>
                </div>
                <label className="flex items-start gap-2 cursor-pointer pl-6 select-none">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    disabled={busy || !preflight.can_start}
                    className="mt-0.5 w-3.5 h-3.5 accent-red-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-[11px] font-bold text-gray-800">
                    I&apos;ve reviewed the details above and understand this run cannot be undone.
                  </span>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-sm">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-[11px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-3 py-2 rounded-sm cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            title={
              preflight && !preflight.can_start ? "This run is blocked — see the reasons above"
                : !acknowledged ? "Tick the acknowledgment above to continue"
                : undefined
            }
            className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-sm cursor-pointer shadow-sm disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {loading ? "Starting…" : "Confirm & Start Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
}
