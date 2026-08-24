// lib/currency.ts
// Client-side MIRROR of app/bank_statement/currency.py — standardizes a
// currency value to an ISO-4217 code so the wizard can prefill/validate the
// currency dropdown. The backend is authoritative (it re-normalizes at save
// and per-row parse); this keeps the wizard UX in sync.

// Keep in lockstep with the backend set -- this list drives the wizard's
// currency dropdown, so a code missing HERE cannot be selected at all, which
// blocks the config save outright (the wizard requires a currency). That is
// exactly how COP and RSD came to be added: both were already in the backend's
// FX rate map, so the system could convert them but not onboard an account in
// them.
export const ISO_4217: string[] = [
  "AED", "AUD", "BHD", "BRL", "CAD", "CHF", "CNY", "COP", "CZK", "DKK",
  "EGP", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "JPY", "KES",
  "KRW", "KWD", "LKR", "MAD", "MXN", "MYR", "NGN", "NOK", "NZD", "OMR",
  "PHP", "PKR", "PLN", "QAR", "RON", "RSD", "RUB", "SAR", "SEK", "SGD",
  "THB", "TRY", "TWD", "TZS", "UGX", "USD", "VND", "ZAR",
];

const ISO_SET = new Set(ISO_4217);

// Non-standard spellings → ISO. Keys are COMPACT (letters/digits, uppercased).
const CURRENCY_ALIASES: Record<string, string> = {
  EURO: "EUR", EUROS: "EUR",
  STERLING: "GBP", POUND: "GBP", POUNDS: "GBP", POUNDSTERLING: "GBP",
  GBPSTERLING: "GBP", UKP: "GBP", BRITISHPOUND: "GBP",
  USDOLLAR: "USD", USDOLLARS: "USD", DOLLAR: "USD", DOLLARS: "USD",
  RUPEE: "INR", RUPEES: "INR", RS: "INR", INDIANRUPEE: "INR",
  YEN: "JPY", JAPANESEYEN: "JPY",
  FRANC: "CHF", SWISSFRANC: "CHF",
  YUAN: "CNY", RENMINBI: "CNY", RMB: "CNY",
  DIRHAM: "AED", UAEDIRHAM: "AED",
  RIYAL: "SAR", SAUDIRIYAL: "SAR",
  RAND: "ZAR",
  AUSDOLLAR: "AUD", AUSSIEDOLLAR: "AUD", AUSTRALIANDOLLAR: "AUD",
  CANDOLLAR: "CAD", CANADIANDOLLAR: "CAD",
  SGDOLLAR: "SGD", SINGAPOREDOLLAR: "SGD",
  HKDOLLAR: "HKD", HONGKONGDOLLAR: "HKD",
  NZDOLLAR: "NZD", NEWZEALANDDOLLAR: "NZD",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR", "£": "GBP", "₹": "INR", "¥": "JPY", "$": "USD",
};

/** Canonical ISO-4217 code for `value`, or null when it can't be mapped. */
export function normalizeCurrency(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || ["nan", "none", "nat"].includes(raw.toLowerCase())) return null;

  const up = raw.toUpperCase();
  if (ISO_SET.has(up)) return up;

  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(sym)) return code;
  }

  const compact = up.replace(/[^A-Z0-9]/g, "");
  if (ISO_SET.has(compact)) return compact;
  if (compact in CURRENCY_ALIASES) return CURRENCY_ALIASES[compact];

  return null;
}
