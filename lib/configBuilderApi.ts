// lib/configBuilderApi.ts
// API client for the account-based Bank Data Ingestion Layer (Config Builder +
// account-config management). Own axios instance, same baseURL as lib/api.ts.
import axios from "axios";
import type { AccountLocator, LocateAccountResult, SaveRecipePayload } from "./configBuilderTypes";
import { getCookie } from "./api";

const API = axios.create({ baseURL: "http://localhost:8000" });

// Same dev-user bypass as lib/api.ts — without this, builder_save's
// get_optional_current_user always resolves to None and config-creation
// activity logs never get written.
API.interceptors.request.use((config) => {
  const devUser = getCookie("login_user_email_stub");
  if (devUser) {
    config.headers.set("X-Dev-User", devUser);
  }
  return config;
});

// ── Wizard ──────────────────────────────────────────────────────────────────
// Upload a report for the wizard WITHOUT triggering ingestion (config-building
// is the no-config-yet case, so the ingest pipeline would always fail
// detection). Returns { filename, source_file_id }.
export const uploadBuilderFile = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return API.post("/api/config/builder/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getBuilderRawPreview = (filename: string) =>
  API.get(`/api/config/builder/raw-preview/${encodeURIComponent(filename)}`);

export const locateAccount = (storage_key: string, locator: AccountLocator, source?: object) =>
  API.post<LocateAccountResult>("/api/config/builder/locate-account", { storage_key, locator, source });

export const testBuilderDraft = (storage_key: string, config_draft: object) =>
  API.post("/api/config/builder/test", { storage_key, config_draft });

export const saveRecipe = (payload: SaveRecipePayload) =>
  API.post("/api/config/builder/save", payload);

// OU/BU picklist for the wizard's OU step — known OUs (already onboarded)
// plus OU numbers seen in the currently loaded aging report that aren't
// onboarded yet (business_unit: null for those, so the wizard prompts for
// the name once).
export const getAvailableOUs = () =>
  API.get<{ ous: { ou_number: string; business_unit: string | null; functional_currency: string | null; known: boolean }[] }>(
    "/api/config/builder/available-ous"
  );

// ── Account management (Manage dialog + Clone-from-existing) ──────────────────
export const listAccounts = () => API.get("/api/config/builder/accounts");

export const getAccount = (accountNumber: string) =>
  API.get(`/api/config/builder/account/${encodeURIComponent(accountNumber)}`);

export const deleteAccount = (accountNumber: string) =>
  API.delete(`/api/config/builder/${encodeURIComponent(accountNumber)}`);

export const deleteRecipe = (accountNumber: string, fmt: string) =>
  API.delete(`/api/config/builder/${encodeURIComponent(accountNumber)}/${encodeURIComponent(fmt)}`);

// ── Detection / resolution ────────────────────────────────────────────────────
export const detectForFile = (filename: string) =>
  API.get(`/api/config/detect/${encodeURIComponent(filename)}`);

export const testExistingConfig = (filename: string, account_number: string, format?: string) =>
  API.post("/api/config/test-existing", { filename, account_number, format });