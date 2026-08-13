import { API } from "./api";

/**
 * Full account numbers are masked in every list/detail response (VAPT
 * remediation) -- these are the only two calls that return the real value,
 * each re-checking the same permission that already gates the underlying
 * record and audit-logging the reveal server-side.
 */
export const revealBankAccountNumber = (accountId: number) =>
  API.get<{ account_number: string }>(`/api/bank-accounts/${accountId}/reveal`).then((r) => r.data.account_number);

export const revealLineItemAccountNumber = (recordId: number) =>
  API.get<{ account_number: string }>(`/api/results/row-detail/${recordId}/reveal-account-number`).then(
    (r) => r.data.account_number,
  );
