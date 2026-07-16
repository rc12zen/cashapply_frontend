const BADGE_STYLES: Record<string, string> = {
  passed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  found: "bg-blue-100 text-blue-800",
  not_found: "bg-gray-100 text-gray-600",
  no_customer: "bg-orange-100 text-orange-800",
  no_invoice: "bg-orange-100 text-orange-800",
  low_confidence: "bg-yellow-100 text-yellow-800",
  validation_failed: "bg-red-100 text-red-800",
  spoc_rejected: "bg-red-100 text-red-800",
  cache: "bg-purple-100 text-purple-800",
  regex: "bg-blue-100 text-blue-800",
  fuzzy: "bg-indigo-100 text-indigo-800",
  "n/a": "bg-gray-100 text-gray-400",
}

export default function StatusBadge({ value }: { value: string | null | undefined }) {
  const v = (value || "").toLowerCase()
  const style = BADGE_STYLES[v] || "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {value || "—"}
    </span>
  )
}
