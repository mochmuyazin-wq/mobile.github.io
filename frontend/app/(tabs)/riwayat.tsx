import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTransaction, updateTransaction, type Transaction } from "@/src/lib/api";
import { useCategories, useFileUrl, useTransactions } from "@/src/lib/queries";
import { Card, Chip, EmptyState, ErrorState, LabeledInput, PrimaryButton, Skeleton } from "@/src/components/ui";
import { SheetModal } from "@/src/components/SheetModal";
import { useToast } from "@/src/components/Toast";
import { CategoryIcon } from "@/src/components/TransactionRow";
import { AuthGate } from "@/src/components/AuthGate";
import { FONT_FAMILY, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { dateLabelID, dayLabelID, dayjs, formatIDR, lastMonths, monthKey, monthLabelID, parseAmount } from "@/src/lib/format";

const OWNERS = [
  { value: "all", label: "Semua" },
  { value: "me", label: "Kamu" },
  { value: "partner", label: "Pasangan" },
];

export default function RiwayatScreen() {
  return (
    <AuthGate>
      <RiwayatInner />
    </AuthGate>
  );
}

function RiwayatInner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [month, setMonth] = useState(monthKey());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [monthSheet, setMonthSheet] = useState(false);
  const [catSheet, setCatSheet] = useState(false);
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const categories = useCategories();
  const from = `${month}-01`;
  const to = dayjs(`${month}-01`).endOf("month").format("YYYY-MM-DD");

  const list = useTransactions({
    owner,
    category_id: categoryId ?? undefined,
    from,
    to,
    q: debouncedQ || undefined,
    limit: 500,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const groups = useMemo(() => {
    const items = list.data?.items ?? [];
    const map = new Map<string, Transaction[]>();
    items.forEach((t) => {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, txs]) => ({
        date,
        txs,
        total: txs.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0),
      }));
  }, [list.data]);

  const remove = useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => {
      toast.show("Transaksi dihapus", "success");
      setDetail(null);
      setConfirmDelete(false);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Gagal menghapus", "error"),
  });

  const months = lastMonths(12);
  const selectedCat = categories.data?.find((c) => c.id === categoryId);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="riwayat-screen">
      {/* Sticky header: search + filters */}
      <View style={styles.header}>
        <Text style={styles.title}>Riwayat</Text>
        <View style={[styles.searchBox, { borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.onSurface }]}
            placeholder="Cari catatan atau kategori..."
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            testID="search-input"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }} style={{ flexGrow: 0 }}>
          {OWNERS.map((o) => (
            <Chip key={o.value} label={o.label} selected={owner === o.value} onPress={() => setOwner(o.value)} testID={`history-owner-${o.value}`} />
          ))}
          <Chip label={monthLabelID(month)} selected={false} onPress={() => setMonthSheet(true)} testID="month-filter-chip" />
          <Chip label={selectedCat?.name ?? "Semua Kategori"} selected={!!selectedCat} onPress={() => setCatSheet(true)} testID="category-filter-chip" />
        </ScrollView>
      </View>

      {list.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={52} />
          ))}
        </View>
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} testID="history-error" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={list.isFetching && !!list.data} onRefresh={() => list.refetch()} tintColor={colors.brandPrimary} />}>
          {groups.length === 0 ? (
            <Card>
              <EmptyState icon="receipt" title="Tidak ada transaksi" message="Coba ubah filter atau pencarian" testID="history-empty" />
            </Card>
          ) : (
            groups.map((g) => (
              <View key={g.date} style={{ marginBottom: spacing.lg }}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel}>{dayLabelID(g.date)}</Text>
                  <Text style={[styles.dayTotal, { color: g.total >= 0 ? colors.success : colors.onSurface }]} testID={`day-total-${g.date}`}>
                    {g.total >= 0 ? "+" : ""}
                    {formatIDR(g.total)}
                  </Text>
                </View>
                <Card>
                  {g.txs.map((tx, idx) => (
                    <View key={tx.id} style={{ borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.divider }}>
                      <Row tx={tx} onPress={() => setDetail(tx)} />
                    </View>
                  ))}
                </Card>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Month sheet */}
      <SheetModal visible={monthSheet} onClose={() => setMonthSheet(false)} title="Pilih Bulan" testID="month-sheet">
        <ScrollView style={{ maxHeight: 420 }}>
          {months.map((m) => (
            <Pressable
              key={m}
              style={styles.sheetRow}
              onPress={() => {
                setMonth(m);
                setMonthSheet(false);
              }}
              testID={`month-option-${m}`}>
              <Text style={{ color: m === month ? colors.brandPrimary : colors.onSurface, fontWeight: m === month ? "700" : "400" }}>{monthLabelID(m)}</Text>
              {m === month ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </SheetModal>

      {/* Category sheet */}
      <SheetModal visible={catSheet} onClose={() => setCatSheet(false)} title="Kategori" testID="category-filter-sheet">
        <ScrollView style={{ maxHeight: 420 }}>
          <Pressable
            style={styles.sheetRow}
            onPress={() => {
              setCategoryId(null);
              setCatSheet(false);
            }}
            testID="filter-category-all">
            <Text style={{ color: !categoryId ? colors.brandPrimary : colors.onSurface, fontWeight: !categoryId ? "700" : "400" }}>Semua Kategori</Text>
            {!categoryId ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
          </Pressable>
          {(categories.data ?? []).map((c) => (
            <Pressable
              key={c.id}
              style={styles.sheetRow}
              onPress={() => {
                setCategoryId(c.id);
                setCatSheet(false);
              }}
              testID={`filter-category-${c.id}`}>
              <Text style={{ color: categoryId === c.id ? colors.brandPrimary : colors.onSurface, fontWeight: categoryId === c.id ? "700" : "400" }}>{c.name}</Text>
              {categoryId === c.id ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </SheetModal>

      {/* Detail sheet */}
      <SheetModal
        visible={!!detail}
        onClose={() => {
          setDetail(null);
          setConfirmDelete(false);
          setEditMode(false);
        }}
        title={editMode ? "Edit Transaksi" : "Detail Transaksi"}
        testID="transaction-detail-sheet">
        {detail ? (
          <DetailBody
            tx={detail}
            onDelete={() => remove.mutate(detail.id)}
            confirming={confirmDelete}
            setConfirming={setConfirmDelete}
            deleting={remove.isPending}
            editMode={editMode}
            setEditMode={setEditMode}
            onSaved={() => {
              setDetail(null);
              setEditMode(false);
              queryClient.invalidateQueries({ queryKey: ["transactions"] });
              queryClient.invalidateQueries({ queryKey: ["summary"] });
              queryClient.invalidateQueries({ queryKey: ["budgets"] });
            }}
          />
        ) : null}
      </SheetModal>
    </View>
  );
}

function Row({ tx, onPress }: { tx: Transaction; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} testID={`history-transaction-${tx.id}`}>
      <CategoryIcon icon={tx.category_icon} isExpense={tx.type === "expense"} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {tx.note?.trim() ? tx.note : tx.category_name}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {tx.category_name} • {tx.created_by_name} • {dateLabelID(tx.date)}
        </Text>
      </View>
      {tx.receipt_path ? <Ionicons name="image" size={16} color={colors.muted} /> : null}
      <Text style={[styles.rowAmount, { color: tx.type === "income" ? colors.success : colors.onSurface }]}>
        {tx.type === "income" ? "+" : "-"}
        {formatIDR(tx.amount)}
      </Text>
    </Pressable>
  );
}

function DetailBody({
  tx,
  onDelete,
  confirming,
  setConfirming,
  deleting,
  editMode,
  setEditMode,
  onSaved,
}: {
  tx: Transaction;
  onDelete: () => void;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  deleting: boolean;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const categories = useCategories();
  const receipt = useFileUrl(tx.receipt_path);
  const isExpense = tx.type === "expense";

  const [editAmount, setEditAmount] = useState(0);
  const [editNote, setEditNote] = useState("");
  const [editCatId, setEditCatId] = useState<string | null>(null);

  useEffect(() => {
    if (editMode) {
      setEditAmount(tx.amount);
      setEditNote(tx.note ?? "");
      setEditCatId(tx.category_id);
    }
  }, [editMode, tx]);

  const update = useMutation({
    mutationFn: () => updateTransaction(tx.id, { amount: editAmount, category_id: editCatId!, note: editNote.trim() || null }),
    onSuccess: () => {
      toast.show("Perubahan disimpan", "success");
      onSaved();
    },
    onError: (e: any) => toast.show(e?.message ?? "Gagal menyimpan perubahan", "error"),
  });

  const submitEdit = () => {
    if (!editAmount || editAmount < 1) return toast.show("Nominal tidak boleh kosong", "error");
    if (!editCatId) return toast.show("Pilih kategori dulu", "error");
    update.mutate();
  };

  if (editMode) {
    return (
      <View testID="transaction-edit-body">
        <Text style={styles.editLabel}>Nominal</Text>
        <View style={[styles.amountBox, { borderColor: colors.border }]}>
          <Text style={styles.amountPrefix}>Rp</Text>
          <TextInput
            style={[styles.amountInput, { color: isExpense ? colors.onSurface : colors.success }]}
            value={editAmount ? formatIDR(editAmount).slice(2).trim() : ""}
            onChangeText={(t) => setEditAmount(parseAmount(t))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            testID="edit-amount-input"
          />
        </View>

        <Text style={[styles.editLabel, { marginTop: spacing.lg }]}>Kategori</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}>
          {(categories.data ?? []).map((c) => (
            <Chip key={c.id} label={c.name} selected={editCatId === c.id} onPress={() => setEditCatId(c.id)} testID={`edit-category-chip-${c.id}`} />
          ))}
        </ScrollView>

        <View style={{ marginTop: spacing.lg }}>
          <LabeledInput label="Catatan" placeholder="contoh: makan siang bareng" value={editNote} onChangeText={setEditNote} multiline testID="edit-note-input" />
        </View>

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <PrimaryButton label="Simpan Perubahan" onPress={submitEdit} loading={update.isPending} testID="save-edit-transaction-button" />
          <PrimaryButton label="Batal" variant="ghost" onPress={() => setEditMode(false)} testID="cancel-edit-transaction-button" />
        </View>
      </View>
    );
  }

  return (
    <View testID="transaction-detail-body">
      {tx.receipt_path ? (
        receipt.isLoading ? (
          <Skeleton height={180} />
        ) : receipt.data ? (
          <Image source={{ uri: receipt.data }} style={styles.receiptImage} resizeMode="contain" />
        ) : null
      ) : null}
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <DetailRow label="Jenis" value={isExpense ? "Pengeluaran" : "Pemasukan"} />
        <DetailRow label="Nominal" value={`${isExpense ? "-" : "+"}${formatIDR(tx.amount)}`} />
        <DetailRow label="Kategori" value={tx.category_name} />
        <DetailRow label="Tanggal" value={dateLabelID(tx.date)} />
        <DetailRow label="Catatan" value={tx.note?.trim() || "-"} />
        <DetailRow label="Diinput oleh" value={tx.created_by_name} />
      </View>
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {confirming ? (
          <>
            <Text style={{ color: colors.error, fontSize: 13, textAlign: "center" }}>Yakin hapus transaksi ini?</Text>
            <PrimaryButton label="Ya, Hapus" variant="danger" onPress={onDelete} loading={deleting} testID="confirm-delete-transaction-button" />
            <PrimaryButton label="Batal" variant="ghost" onPress={() => setConfirming(false)} testID="cancel-delete-transaction-button" />
          </>
        ) : (
          <>
            <PrimaryButton label="Edit Transaksi" variant="ghost" onPress={() => setEditMode(true)} testID="edit-transaction-button" />
            <PrimaryButton label="Hapus Transaksi" variant="danger" onPress={() => setConfirming(true)} testID="delete-transaction-button" />
          </>
        )}
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// (pull-to-refresh uses RN RefreshControl directly — a custom wrapper component
// would swallow the cloned ScrollView child on react-native-web)

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.onSurface,
    fontFamily: FONT_FAMILY,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: spacing.sm,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
  },
  dayTotal: {
    fontSize: 12,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.onSurface,
  },
  rowSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  sheetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.muted,
    width: 110,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.onSurface,
    textAlign: "right",
  },
  receiptImage: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.xs + 2,
  },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    minHeight: 56,
  },
  amountPrefix: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.muted,
    marginRight: spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: "800",
    fontFamily: FONT_FAMILY,
    paddingVertical: spacing.md,
  },
}));
