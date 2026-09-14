import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getBudgets,
  getCategories,
  getMe,
  getNotifications,
  getSummary,
  getTransactions,
  getWallet,
  fileUrl,
  type Summary,
  type TxFilters,
} from "@/src/lib/api";

// Real-time feel: poll shared data every 4s so partner changes appear without
// manual refresh. React Query also refetches on window/route focus.
export const POLL_INTERVAL = 4000;

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: getMe, retry: false, staleTime: 60_000 });
}

export function useWallet() {
  return useQuery({ queryKey: ["wallet"], queryFn: getWallet, refetchInterval: POLL_INTERVAL, retry: false });
}

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: 30_000 });
}

export function useTransactions(filters: TxFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => getTransactions(filters),
    refetchInterval: POLL_INTERVAL,
    placeholderData: keepPreviousData,
  });
}

export function useSummary(params: { period: string; ref: string; owner: string }) {
  return useQuery<Summary>({
    queryKey: ["summary", params],
    queryFn: () => getSummary(params),
    refetchInterval: POLL_INTERVAL,
    placeholderData: keepPreviousData,
  });
}

export function useBudgets(month?: string) {
  return useQuery({
    queryKey: ["budgets", month],
    queryFn: () => getBudgets(month),
    refetchInterval: POLL_INTERVAL,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useFileUrl(path?: string | null) {
  return useQuery({
    queryKey: ["file", path],
    queryFn: () => fileUrl(path!),
    enabled: !!path,
    staleTime: 5 * 60_000,
  });
}
