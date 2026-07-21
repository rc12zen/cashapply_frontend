"use client";
/**
 * components/PageAccessDenied.tsx
 * ==================================
 * Shown by a page when usePageGuard() determines the signed-in user's
 * role(s) don't include the permission that page needs. The backend would
 * 403 every API call this page makes anyway (see auth/permissions.py) —
 * this is just a clean stop instead of a screen full of failed requests.
 */
import { ShieldAlert } from "lucide-react";

export default function PageAccessDenied({
  message = "You don't have permission to view this page. Contact an administrator if you think this is wrong.",
}: {
  message?: string;
}) {
  return (
    <div className="max-w-md mx-auto mt-20 text-center">
      <ShieldAlert size={28} className="mx-auto text-gray-300 mb-3" />
      <h1 className="text-sm font-black text-primary uppercase tracking-wider mb-1.5">Not allowed</h1>
      <p className="text-xs text-gray-500 font-medium">{message}</p>
    </div>
  );
}
