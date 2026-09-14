import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LineChart } from "react-native-gifted-charts";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteBudget, upsertBudget, type BudgetItem } from "@/src/lib/api";
import { useBudgets, useCategories, useSummary } from "@/src/lib/queries";
import { Card, Chip, EmptyState, LabeledInput, PrimaryButton, ProgressBar, SectionTitle, Skeleton } from "@/src/components/ui";
import { SheetModal } from "@/src/components/SheetModal";
import { useToast } from "@/src/components/Toast";
import { CategoryIcon } from "@/src/components/TransactionRow";
import { AuthGate } from "@/src/components/AuthGate";
import { FONT_FAMILY, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { formatIDR, lastMonths, monthKey, monthLabelID, monthShort, todayISO } from "@/src/lib/format";

export default function AnggaranScreen() {
  return (
    <AuthGate>
      <AnggaranInner />
    </AuthGate>
  );
}

function AnggaranInner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(monthKey());
  const budgets = useBudgets(month);
  const categories = useCategories();
  const trendQuery = useSummary({ period: "month", ref: todayISO(), owner: "all" });

  const [addSheet, setAddSheet] = useState(false);
  const [editSheet, setEditSheet] = useState<BudgetItem | null>(null);
  const [newCatId, setNewCatId] = useState<string | null>(null);
  const [newLimit, setNewLimit] = useState("");
  const [editLimit, setEditLimit] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["budgets"] });

  const upsert = useMutation({
    mutationFn: (vars: { category_id: string; limit_amount: number }) => upsertBudget(vars.category_id, month, vars.limit_amount),
    onSuccess: () => {
      toast.show("Anggaran disimpan", "success");
      invalidate();
      setAddSheet(false);
      setEditSheet(null);
    },
    onError: (e: any) => toast.show(e?.message ?? "Gagal menyimpan anggaran", "error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteBudget(id),
    onSuccess: () => {
      toast.show("Anggaran dihapus", "success");
      setEditSheet(null);
      invalidate();
    },
    onError: (e: any) => toast.show(e?.message ?? "Gagal menghapus anggaran", "error"),
  });

  const items = budgets.data?.items ?? [];
  const exceeded = items.filter((i) => i.status === "exceeded");
  const warning = items.filter((i) => i.status === "warning");
  const hasBudgeted = (id: string) => items.some((i) => i.category_id === id);

  const trend = trendQuery.data?.trend ?? [];
  const lineData = trend.map((t) => ({ value: +(t.expense / 1e6).toFixed(1), label: monthShort(t.month) }));

  const submitAdd = () => {
    const limit = parseInt(newLimit.replace(/\D/g, ""), 10) || 0;
    if (!newCatId) return toast.show("Pilih kategori", "error");
    if (limit < 1) return toast.show("Isi nominal limit", "error");
    upsert.mutate({ category_id: newCatId, limit_amount: limit });
  };

  const submitEdit = () => {
    if (!editSheet) return;
    const limit = parseInt(editLimit.replace(/\D/g, ""), 10) || 0;
    if (limit < 1) return toast.show("Isi nominal limit", "error");
    upsert.mutate({ category_id: editSheet.category_id, limit_amount: limit });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="anggaran-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Anggaran</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.lg, paddingRight: spacing.lg }} style={{ flexGrow: 0 }}>
          {lastMonths(6)
            .slice()
            .reverse()
            .map((m) => (
              <Chip key={m} label={monthLabelID(m)} selected={month === m} onPress={() => setMonth(m)} testID={`budget-month-${m}`} />
            ))}
        </ScrollView>

        {/* Exceeded / warning banner */}
        {exceeded.length + warning.length > 0 ? (
          <Card style={{ marginBottom: spacing.lg, borderColor: colors.warning, borderWidth: 1 }} testID="budget-warning-banner">
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
              <Ionicons name="warning" size={18} color={colors.warning} />
              <Text style={styles.bannerText}>
                {exceeded.length > 0
                  ? `${exceeded.map((i) => i.category_name).join(", ")} sudah lewat limit anggaran`
                  : `${warning.map((i) => i.category_name).join(", ")} mendekati limit anggaran`}
              </Text>
            </View>
          </Card>
        ) : null}

        {/* Monthly trend */}
        <Card style={{ marginBottom: spacing.lg }} testID="budget-trend-card">
          <SectionTitle>Pengeluaran 6 Bulan</SectionTitle>
          {trendQuery.isLoading ? (
            <Skeleton height={170} />
          ) : (
            <LineChart
              data={lineData}
              height={170}
              adjustToWidth
              curved
              thickness={2}
              color={colors.brandPrimary}
              dataPointsColor={colors.brandPrimary}
              dataPointsRadius={3}
              noOfSections={3}
              yAxisLabelSuffix="jt"
              yAxisColor={colors.border}
              xAxisColor={colors.border}
              yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
              xAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
              hideArrow
              areaChart
              startFillColor={colors.brandPrimary}
              startOpacity={0.15}
              endOpacity={0}
            />
          )}
        </Card>

        <SectionTitle
          action={
            <Pressable
              onPress={() => {
                setNewCatId(null);
                setNewLimit("");
                setAddSheet(true);
              }}
              testID="add-budget-button"
              hitSlop={8}>
              <Text style={{ color: colors.brandPrimary, fontSize: 13, fontWeight: "600" }}>+ Atur Anggaran</Text>
            </Pressable>
          }>
          {monthLabelID(month)}
        </SectionTitle>

        {budgets.isLoading ? (
          <View style={{ gap: spacing.sm }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={80} />
            ))}
          </View>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon="wallet" title="Belum ada anggaran diatur" message="Atur limit per kategori supaya pengeluaran lebih terkendali" testID="budget-empty" />
            <PrimaryButton
              label="Atur Anggaran Pertama"
              onPress={() => {
                setNewCatId(null);
                setNewLimit("");
                setAddSheet(true);
              }}
              testID="empty-add-budget-button"
              style={{ marginBottom: spacing.lg, marginHorizontal: spacing.lg }}
            />
          </Card>
        ) : (
          <View style={{ gap: spacing.md }}>
            {items.map((b) => (
              <Card key={b.id} testID={`budget-item-${b.id}`}>
                <Pressable onPress={() => { setEditLimit(String(b.limit_amount)); setEditSheet(b); }} testID={`budget-edit-${b.id}`}>
                  <View style={styles.budgetHeader}>
                    <CategoryIcon icon={b.category_icon} isExpense />
                    <Text style={styles.budgetName} numberOfLines={1}>
                      {b.category_name}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: b.status === "exceeded" ? colors.error : b.status === "warning" ? colors.warning : colors.brandTertiary }]}>
                      <Text style={[styles.statusText, { color: b.status === "exceeded" ? colors.onError : b.status === "warning" ? colors.onWarning : colors.onBrandTertiary }]}>
                        {b.status === "exceeded" ? "Lewat Limit" : b.status === "warning" ? "Hampir Habis" : `${Math.round(b.pct * 100)}%`}
                      </Text>
                    </View>
                  </View>
                  <ProgressBar pct={b.pct} testID={`budget-progress-${b.id}`} />
                  <View style={styles.budgetMeta}>
                    <Text style={styles.budgetSpent}>
                      {formatIDR(b.spent)} <Text style={{ color: colors.muted, fontWeight: "400" }}>dari {formatIDR(b.limit_amount)}</Text>
                    </Text>
                    <Text style={{ fontSize: 12, color: b.pct >= 1 ? colors.error : colors.muted }}>
                      {b.pct >= 1 ? `Lewat ${formatIDR(b.spent - b.limit_amount)}` : `Sisa ${formatIDR(b.limit_amount - b.spent)}`}
                    </Text>
                  </View>
                </Pressable>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add budget sheet */}
      <SheetModal visible={addSheet} onClose={() => setAddSheet(false)} title="Atur Anggaran" testID="add-budget-sheet">
        <Text style={styles.sheetLabel}>Kategori</Text>
        <View style={styles.catGrid}>
          {(categories.data ?? [])
            .filter((c) => !hasBudgeted(c.id))
            .map((c) => (
              <Chip key={c.id} label={c.name} selected={newCatId === c.id} onPress={() => setNewCatId(c.id)} testID={`budget-category-${c.id}`} />
            ))}
          {(categories.data ?? []).filter((c) => !hasBudgeted(c.id)).length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Semua kategori sudah punya anggaran bulan ini</Text>
          ) : null}
        </View>
        <View style={{ marginTop: spacing.lg }}>
          <LabeledInput label="Limit per bulan" placeholder="contoh: 1000000" value={newLimit} onChangeText={setNewLimit} keyboardType="number-pad" testID="budget-limit-input" />
          <PrimaryButton label="Simpan Anggaran" onPress={submitAdd} loading={upsert.isPending} testID="submit-budget-button" style={{ marginTop: spacing.md }} />
        </View>
      </SheetModal>

      {/* Edit budget sheet */}
      <SheetModal visible={!!editSheet} onClose={() => setEditSheet(null)} title={`Anggaran ${editSheet?.category_name ?? ""}`} testID="edit-budget-sheet">
        <LabeledInput label="Limit per bulan" placeholder="contoh: 1000000" value={editLimit} onChangeText={setEditLimit} keyboardType="number-pad" testID="edit-budget-limit-input" />
        <PrimaryButton label="Simpan Perubahan" onPress={submitEdit} loading={upsert.isPending} testID="update-budget-button" style={{ marginTop: spacing.md }} />
        <PrimaryButton label="Hapus Anggaran" variant="danger" onPress={() => editSheet && remove.mutate(editSheet.id)} loading={remove.isPending} testID="delete-budget-button" style={{ marginTop: spacing.sm }} />
      </SheetModal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.onSurface,
    fontFamily: FONT_FAMILY,
    marginBottom: spacing.md,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
  },
  budgetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  budgetName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  budgetMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  budgetSpent: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.onSurface,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
  },
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
}));
