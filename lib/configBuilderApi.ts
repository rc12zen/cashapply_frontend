// lib/configBuilderApi.ts
// API client for the account-based Bank Data Ingestion Layer (Config Builder +
// account-config management). Own axios instance, same baseURL as lib/api.ts.
import axios from "axios";
import type { AccountLocator, LocateAccountResult, SaveRecipePayload } from "./configBuilderTypes";

const API = axios.create({ baseURL: "http://localhost:8000" });

// ── Wizard ──────────────────────────────────────────────────────────────────
export const getBuilderRawPreview = (filename: string) =>
  API.get(`/api/config/builder/raw-preview/${encodeURIComponent(filename)}`);

export const locateAccount = (storage_key: string, locator: AccountLocator, source?: object) =>
  API.post<LocateAccountResult>("/api/config/builder/locate-account", { storage_key, locator, source });

export const testBuilderDraft = (storage_key: string, config_draft: object) =>
  API.post("/api/config/builder/test", { storage_key, config_draft });

export const saveRecipe = (payload: SaveRecipePayload) =>
  API.post("/api/config/builder/save", payload);

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