import { queryOptions } from "@tanstack/react-query";
import { getBillingStatus, getSponsorAdStats } from "@/lib/ad-stats.functions";
import { listPendingSubmissions } from "@/lib/submissions.functions";

// Keep the existing key prefixes so billing-management invalidations still
// work, but never share authenticated results between signed-in accounts.
export const billingStatusQuery = (userId: string) => queryOptions({
  queryKey: ["billing-status", userId],
  queryFn: () => getBillingStatus({ data: {} }),
  staleTime: 0,
  refetchOnMount: "always",
});

export const sponsorStatsQuery = (userId: string, days = 30) => queryOptions({
  queryKey: ["sponsor-ad-stats", userId, days],
  queryFn: () => getSponsorAdStats({ data: { days } }),
  staleTime: 0,
  refetchOnMount: "always",
});

export const pendingSubmissionsQuery = (userId: string) => queryOptions({
  queryKey: ["pending-submissions", userId],
  queryFn: () => listPendingSubmissions(),
  staleTime: 0,
  refetchOnMount: "always",
});