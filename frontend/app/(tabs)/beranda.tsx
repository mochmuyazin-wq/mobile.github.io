import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { LineChart, PieChart } from "react-native-gifted-charts";
import { Card, Chip, EmptyState, ErrorState, SectionTitle, Skeleton } from "@/src/components/ui";
import { TransactionRow } from "@/src/components/TransactionRow";
import { AuthGate } from "@/src/components/AuthGate";
import { useMe, useNotifications, useSummary, useTransactions } from "@/src/lib/queries";
import { CHART_COLORS, FONT_FAMILY, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { formatIDR, greetingID, monthShort, todayISO } from "@/src/lib/format";

const PERIODS = [
  { value: "day", label: "Hari Ini" },
  { value: "week", label: "Minggu Ini" },
  { value: "month", label: "Bulan Ini" },
];

const OWNERS = [
  { value: "all", label: "Gabungan" },
  { value: "me", label: "Kamu" },
  { value: "partner", label: "Pasangan" },
];

export default function BerandaScreen() {
  return (
    <AuthGate>
      <BerandaInner />
    </AuthGate>
  );
}

function BerandaInner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const me = useMe();
  const notifications = useNotifications();

  const [owner, setOwner] = useState("all");
  const [period, setPeriod] = useState("month");
  const ref = todayISO();

  const summary = useSummary({ period, ref, owner });
  const recent = useTransactions({ limit: 5 });

  const unread = notifications.data?.unread ?? 0;

  const pieData = useMemo(() => {
    const cats = summary.data?.by_category ?? [];
    return cats.slice(0, 6).map((c, i) => ({ value: c.value, color: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [summary.data]);
  const pieTotal = (summary.data?.by_category ?? []).reduce((s, c) => s + c.value, 0);

  const trend = summary.data?.trend ?? [];
  const hasTrend = trend.some((t) => t.income > 0 || t.expense > 0);
  const axisLabelStyle = { color: colors.muted, fontSize: 10 };
  const lineData = trend.map((t) => ({ value: +(t.expense / 1e6).toFixed(1), label: monthShort(t.month), labelTextStyle: axisLabelStyle }));
  const lineData2 = trend.map((t) => ({ value: +(t.income / 1e6).toFixed(1), label: monthShort(t.month), labelTextStyle: axisLabelStyle }));

  if (me.isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }]} testID="beranda-loading">
        <Skeleton height={24} style={{ width: "50%" }} />
        <Skeleton height={140} style={{ marginTop: spacing.lg }} />
        <Skeleton height={200} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  const firstName = (me.data?.name ?? "").split(" ")[0];

  return (
    <View style={styles.screen} testID="beranda-screen">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={summary.isFetching && !!summary.data}
            onRefresh={() => {
              summary.refetch();
              recent.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greetingID()},</Text>
            <Text style={styles.headerName}>{firstName} 👋</Text>
          </View>
          <Pressable onPress={() => router.push("/notifications" as any)} style={styles.bellButton} testID="open-notifications-button">
            <Ionicons name="notifications-outline" size={22} color={colors.onSurface} />
            {unread > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.error }]}>
                <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Balance card */}
        <LinearGradient colors={[colors.brandPrimary, colors.brandSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Saldo Bersama</Text>
          <Text style={styles.balanceValue} testID="balance-value">
            {formatIDR(summary.data?.balance ?? 0)}
          </Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Ionicons name="arrow-down" size={14} color={colors.onBrandPrimary} />
              <Text style={styles.balanceItemLabel}>Pemasukan</Text>
              <Text style={styles.balanceItemValue} testID="income-value">
                {formatIDR(summary.data?.income ?? 0)}
              </Text>
            </View>
            <View style={[styles.balanceItem, { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.35)" }]}>
              <Ionicons name="arrow-up" size={14} color={colors.onBrandPrimary} />
              <Text style={styles.balanceItemLabel}>Pengeluaran</Text>
              <Text style={styles.balanceItemValue} testID="expense-value">
                {formatIDR(summary.data?.expense ?? 0)}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Filters */}
        <View style={styles.filtersRow}>
          {PERIODS.map((p) => (
            <Chip key={p.value} label={p.label} selected={period === p.value} onPress={() => setPeriod(p.value)} testID={`period-chip-${p.value}`} />
          ))}
        </View>
        <View style={{ marginBottom: spacing.md }}>
          <SegmentedFilter owner={owner} onChange={setOwner} />
        </View>

        {/* Pie chart */}
        <Card style={{ marginBottom: spacing.lg }} testID="pie-card">
          <SectionTitle>Pengeluaran per Kategori</SectionTitle>
          {summary.isLoading ? (
            <Skeleton height={180} />
          ) : pieData.length === 0 ? (
            <EmptyState icon="pie-chart" title="Belum ada pengeluaran" message="Pengeluaran periode ini akan muncul di sini" testID="pie-empty" />
          ) : (
            <View style={styles.pieWrap}>
              <PieChart
                data={pieData}
                donut
                innerRadius={52}
                radius={80}
                centerLabelComponent={() => (
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "700" }}>{formatIDRShort(pieTotal)}</Text>
                    <Text style={{ color: colors.muted, fontSize: 9 }}>Total</Text>
                  </View>
                )}
                focusOnPress
              />
              <View style={styles.legend}>
                {(summary.data?.by_category ?? []).slice(0, 6).map((c, i) => (
                  <View key={c.name} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                    <Text style={styles.legendName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={styles.legendValue}>{Math.round((c.value / pieTotal) * 100)}%</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

        {/* Trend line chart */}
        <Card style={{ marginBottom: spacing.lg }} testID="trend-card">
          <SectionTitle>Tren 6 Bulan</SectionTitle>
          {summary.isLoading ? (
            <Skeleton height={180} />
          ) : !hasTrend ? (
            <EmptyState icon="trending-up" title="Belum ada tren" message="Grafik pemasukan & pengeluaran bulanan muncul setelah ada transaksi" testID="trend-empty" />
          ) : (
            <View>
              <LineChart
                data={lineData}
                data2={lineData2}
                height={170}
                adjustToWidth
                curved
                thickness={2}
                color={colors.error}
                color2={colors.success}
                dataPointsColor={colors.error}
                dataPointsColor2={colors.success}
                dataPointsRadius={3}
                noOfSections={3}
                yAxisLabelSuffix="jt"
                yAxisColor={colors.border}
                xAxisColor={colors.border}
                yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
              />
              <View style={styles.trendLegend}>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.legendName}>Pemasukan</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                  <Text style={styles.legendName}>Pengeluaran</Text>
                </View>
              </View>
            </View>
          )}
        </Card>

        {/* Recent transactions */}
        <SectionTitle
          action={
            <Pressable onPress={() => router.push("/(tabs)/riwayat" as any)} testID="see-all-transactions">
              <Text style={{ color: colors.brandPrimary, fontSize: 13, fontWeight: "600" }}>Lihat Semua</Text>
            </Pressable>
          }>
          Transaksi Terbaru
        </SectionTitle>
        {recent.isLoading ? (
          <Card>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={48} style={{ marginBottom: spacing.sm }} />
            ))}
          </Card>
        ) : (recent.data?.items.length ?? 0) === 0 ? (
          <Card>
            <EmptyState icon="receipt" title="Belum ada transaksi bulan ini" message="Tambahkan transaksi pertama kamu di tab Tambah" testID="recent-empty" />
          </Card>
        ) : (
          <Card>
            {recent.data!.items.map((tx, idx) => (
              <View key={tx.id} style={{ borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.divider }}>
                <TransactionRow tx={tx} testID={`recent-transaction-${tx.id}`} />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function SegmentedFilter({ owner, onChange }: { owner: string; onChange: (v: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { borderColor: colors.border }]}>
      {OWNERS.map((o) => {
        const active = o.value === owner;
        return (
          <Pressable
            key={o.value}
            testID={`owner-filter-${o.value}`}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && { backgroundColor: colors.brandPrimary, borderRadius: radius.sm }]}>
            <Text style={[styles.segmentLabel, { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatIDRShort(n: number): string {
  if (n >= 1e9) return `Rp${(n / 1e9).toFixed(1).replace(".", ",")} M`;
  if (n >= 1e6) return `Rp${(n / 1e6).toFixed(1).replace(".", ",")} jt`;
  if (n >= 1e3) return `Rp${Math.round(n / 1e3)} rb`;
  return formatIDR(n);
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  greeting: {
    fontSize: 13,
    color: colors.muted,
  },
  headerName: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
    fontFamily: FONT_FAMILY,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  balanceCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    fontSize: 13,
    color: colors.onBrandPrimary,
    opacity: 0.9,
    marginBottom: spacing.xs,
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.onBrandPrimary,
    fontFamily: FONT_FAMILY,
    marginBottom: spacing.lg,
  },
  balanceRow: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  balanceItem: {
    flex: 1,
    gap: 2,
  },
  balanceItemLabel: {
    fontSize: 11,
    color: colors.onBrandPrimary,
    opacity: 0.85,
  },
  balanceItemValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onBrandPrimary,
  },
  filtersRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pieWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  legend: {
    flex: 1,
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendName: {
    flex: 1,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
  },
  legendValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
  },
  trendLegend: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  segmented: {
    flexDirection: "row",
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 2,
    backgroundColor: colors.surface,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
}));
