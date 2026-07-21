// lib/errorMessage.ts
// The backend now returns every error (deliberate or unexpected) as
// { title, message } — see app/common/errors.py. Never a raw exception
// string, never a stack trace. These two helpers read that shape, with a
// couple of graceful fallbacks (a stale response shape mid-deploy, a
// network error with no response body at all) so nothing breaks if the
// two ever drift for a moment.
export function getErrorMessage(e: any, fallback = "Something went wrong. Please try again."): string {
  const data = e?.response?.data;
  if (data?.message) return data.message;
  if (typeof data?.detail === "string") return data.detail; // back-compat, old shape
  if (!e?.response) return "Could not reach the server. Check your connection and try again.";
  return fallback;
}

export function getErrorTitle(e: any, fallback = "Something went wrong"): string {
  const data = e?.response?.data;
  if (data?.title) return data.title;
  if (!e?.response) return "Connection problem";
  return fallback;
}
