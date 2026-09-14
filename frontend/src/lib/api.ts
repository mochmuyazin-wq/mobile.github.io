import { Platform } from "react-native";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
export const API_URL = `${BACKEND_URL}/api`;
export const TOKEN_KEY = "auth_token";

export type TxType = "income" | "expense";

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  wallet_id: string | null;
}

export interface WalletInfo {
  id: string;
  name: string;
  members: User[];
  invite: { code: string; expires_at: string | null } | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category_id: string;
  category_name: string;
  category_icon: string;
  date: string;
  note: string | null;
  created_by: string;
  created_by_name: string;
  receipt_path: string | null;
  created_at: string;
}

export interface Summary {
  balance: number;
  income: number;
  expense: number;
  by_category: { name: string; value: number }[];
  trend: { month: string; income: number; expense: number }[];
}

export interface BudgetItem {
  id: string;
  category_id: string;
  category_name: string;
  category_icon: string;
  limit_amount: number;
  spent: number;
  pct: number;
  status: "ok" | "warning" | "exceeded";
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getToken(): Promise<string | null> {
  return storage.secureGet(TOKEN_KEY, null);
}

export async function setToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"] && options.body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    await clearToken();
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = data?.detail;
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Terjadi kesalahan, coba lagi");
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function registerUser(name: string, identifier: string, password: string) {
  return apiFetch<{ access_token: string; user: User }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, identifier, password }),
  });
}

export async function loginUser(identifier: string, password: string) {
  return apiFetch<{ access_token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export async function getMe() {
  return apiFetch<User>("/me");
}

export async function getWallet() {
  return apiFetch<WalletInfo>("/wallet");
}

export async function createInvite() {
  return apiFetch<{ code: string; expires_at: string }>("/wallet/invite", { method: "POST" });
}

export async function joinWallet(code: string) {
  return apiFetch("/wallet/join", { method: "POST", body: JSON.stringify({ code }) });
}

export async function getCategories() {
  return apiFetch<Category[]>("/categories");
}

export async function createCategory(name: string) {
  return apiFetch<Category>("/categories", { method: "POST", body: JSON.stringify({ name }) });
}

export async function deleteCategory(id: string) {
  return apiFetch(`/categories/${id}`, { method: "DELETE" });
}

export interface TxFilters {
  owner?: string;
  type?: string;
  category_id?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
}

export async function getTransactions(filters: TxFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  return apiFetch<{ items: Transaction[]; total: number }>(`/transactions?${params.toString()}`);
}

export async function createTransaction(body: {
  type: TxType;
  amount: number;
  category_id: string;
  date: string;
  note?: string | null;
  receipt_path?: string | null;
}) {
  return apiFetch<Transaction>("/transactions", { method: "POST", body: JSON.stringify(body) });
}

export async function deleteTransaction(id: string) {
  return apiFetch(`/transactions/${id}`, { method: "DELETE" });
}

export async function getSummary(params: { period?: string; ref?: string; owner?: string }) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return apiFetch<Summary>(`/summary?${qs}`);
}

export async function getBudgets(month?: string) {
  return apiFetch<{ month: string; items: BudgetItem[] }>(`/budgets${month ? `?month=${month}` : ""}`);
}

export async function upsertBudget(category_id: string, month: string, limit_amount: number) {
  return apiFetch("/budgets", { method: "PUT", body: JSON.stringify({ category_id, month, limit_amount }) });
}

export async function deleteBudget(id: string) {
  return apiFetch(`/budgets/${id}`, { method: "DELETE" });
}

export async function getNotifications() {
  return apiFetch<{ items: AppNotification[]; unread: number }>("/notifications");
}

export async function markNotificationsRead() {
  return apiFetch("/notifications/read-all", { method: "POST" });
}

export async function registerPushToken(user_id: string, platform: string, device_token: string) {
  return apiFetch("/register-push", { method: "POST", body: JSON.stringify({ user_id, platform, device_token }) });
}

// Authenticated receipt photo URL (token in query so it works on web too).
export async function fileUrl(path: string): Promise<string> {
  const token = await getToken();
  return `${API_URL}/files/${path}?token=${encodeURIComponent(token ?? "")}`;
}

// Multipart upload; body shape differs between web and native.
export async function uploadReceipt(uri: string, name: string): Promise<string> {
  const token = await getToken();
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: "image/jpeg" } as any);
  }
  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.detail ?? "Gagal mengunggah foto");
  return data.path as string;
}
