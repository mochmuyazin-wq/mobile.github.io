import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCategory, createTransaction, deleteCategory, uploadReceipt, type TxType } from "@/src/lib/api";
import { useCategories } from "@/src/lib/queries";
import { Card, Chip, LabeledInput, PrimaryButton, SectionTitle } from "@/src/components/ui";
import { SheetModal } from "@/src/components/SheetModal";
import { AuthGate } from "@/src/components/AuthGate";
import { useToast } from "@/src/components/Toast";
import { FONT_FAMILY, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { dayjs, formatIDR, parseAmount, todayISO } from "@/src/lib/format";

export default function TambahScreen() {
  return (
    <AuthGate>
      <TambahInner />
    </AuthGate>
  );
}

function TambahInner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const queryClient = useQueryClient();

  const categories = useCategories();

  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);

  const [catSheet, setCatSheet] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [dateSheet, setDateSheet] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["budgets"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      let receiptPath: string | null = null;
      if (photoUri) {
        receiptPath = await uploadReceipt(photoUri, photoName ?? `struk-${Date.now()}.jpg`);
      }
      return createTransaction({
        type,
        amount,
        category_id: categoryId!,
        date,
        note: note.trim() || null,
        receipt_path: receiptPath,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show("Transaksi tersimpan", "success");
      invalidate();
      setAmount(0);
      setNote("");
      setPhotoUri(null);
      setPhotoName(null);
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      toast.show(e?.message ?? "Gagal menyimpan transaksi", "error");
    },
  });

  const submit = () => {
    if (!amount || amount < 1) return toast.show("Nominal tidak boleh kosong", "error");
    if (!categoryId) return toast.show("Pilih kategori dulu", "error");
    save.mutate();
  };

  const addCategory = useMutation({
    mutationFn: () => createCategory(newCatName.trim()),
    onSuccess: (cat) => {
      setCategoryId(cat.id);
      setNewCatName("");
      setCatSheet(false);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.show("Kategori ditambahkan", "success");
    },
    onError: (e: any) => toast.show(e?.message ?? "Gagal menambah kategori", "error"),
  });

  const removeCategory = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.show("Kategori dihapus", "success");
    },
    onError: (e: any) => toast.show(e?.message ?? "Gagal menghapus kategori", "error"),
  });

  // Photo source picker (doubles as the pre-permission explanation).
  const [sourceSheet, setSourceSheet] = useState<null | "denied">(null);
  const pickImage = async (fromCamera: boolean) => {
    setSourceSheet(null);
    if (fromCamera) {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) {
        toast.show(cam.canAskAgain ? "Izin kamera dibutuhkan untuk foto struk" : "Izin kamera ditolak, aktifkan di Pengaturan", "error");
        if (!cam.canAskAgain) setSourceSheet("denied");
        return;
      }
    } else {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        toast.show(lib.canAskAgain ? "Izin galeri dibutuhkan untuk memilih struk" : "Izin galeri ditolak, aktifkan di Pengaturan", "error");
        if (!lib.canAskAgain) setSourceSheet("denied");
        return;
      }
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ["images"] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"], allowsMultipleSelection: false });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      const ext = (result.assets[0].uri.split(".").pop() ?? "jpg").toLowerCase();
      setPhotoName(`struk-${Date.now()}.${["jpg", "jpeg", "png", "webp", "heic"].includes(ext) ? ext : "jpg"}`);
    }
  };

  const dateChips = Array.from({ length: 7 }, (_, i) => dayjs().subtract(i, "day"));

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        bottomOffset={100}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Tambah Transaksi</Text>

        <View style={{ marginBottom: spacing.lg }}>
          <SegmentType type={type} onChange={setType} />
        </View>

        {/* Amount */}
        <Text style={styles.inputLabel}>Nominal</Text>
        <View style={[styles.amountBox, { borderColor: colors.border }]}>
          <Text style={styles.amountPrefix}>Rp</Text>
          <TextInput
            style={[styles.amountInput, { color: type === "income" ? colors.success : colors.onSurface }]}
            value={amount ? formatIDR(amount).slice(2).trim() : ""}
            onChangeText={(t) => setAmount(parseAmount(t))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            testID="amount-input"
          />
        </View>

        {/* Category */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionTitle
            action={
              <Pressable onPress={() => setCatSheet(true)} testID="add-category-button" hitSlop={8}>
                <Text style={{ color: colors.brandPrimary, fontSize: 13, fontWeight: "600" }}>+ Kategori</Text>
              </Pressable>
            }>
            Kategori
          </SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}>
            {(categories.data ?? []).map((c) => (
              <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} testID={`category-chip-${c.id}`} />
            ))}
            {categories.isLoading ? <Skeleton height={36} width={90} /> : null}
          </ScrollView>
        </View>

        {/* Date */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionTitle>Tanggal</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}>
            {dateChips.map((d) => {
              const iso = d.format("YYYY-MM-DD");
              const label = iso === todayISO() ? "Hari Ini" : iso === dayjs().subtract(1, "day").format("YYYY-MM-DD") ? "Kemarin" : d.format("DD MMM");
              return <Chip key={iso} label={label} selected={date === iso} onPress={() => setDate(iso)} testID={`date-chip-${iso}`} />;
            })}
            <Chip label="Lainnya" selected={!dateChips.some((d) => d.format("YYYY-MM-DD") === date)} onPress={() => setDateSheet(true)} testID="date-chip-custom" />
          </ScrollView>
        </View>

        {/* Note */}
        <View style={{ marginTop: spacing.lg }}>
          <LabeledInput
            label="Catatan (opsional)"
            placeholder="contoh: makan siang bareng"
            value={note}
            onChangeText={setNote}
            multiline
            testID="note-input"
          />
        </View>

        {/* Receipt photo */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionTitle>Struk / Bukti (opsional)</SectionTitle>
          {photoUri ? (
            <View>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              <Pressable style={styles.photoRemove} onPress={() => setPhotoUri(null)} testID="remove-photo-button">
                <Ionicons name="close-circle" size={26} color={colors.error} />
              </Pressable>
            </View>
          ) : (
            <Pressable style={[styles.photoBox, { borderColor: colors.border }]} onPress={() => setSourceSheet("picker")} testID="attach-photo-button">
              <Ionicons name="camera" size={26} color={colors.muted} />
              <Text style={styles.photoBoxText}>Ambil foto atau pilih dari galeri</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        <PrimaryButton label={save.isPending ? "Menyimpan..." : "Simpan Transaksi"} onPress={submit} loading={save.isPending} testID="save-transaction-button" />
      </KeyboardStickyView>

      {/* Category sheet */}
      <SheetModal visible={catSheet} onClose={() => setCatSheet(false)} title="Kategori" testID="category-sheet">
        {(categories.data ?? []).map((c) => (
          <View key={c.id} style={styles.sheetRow}>
            <Pressable
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
              onPress={() => {
                setCategoryId(c.id);
                setCatSheet(false);
              }}
              testID={`sheet-category-${c.id}`}>
              <Text style={{ color: categoryId === c.id ? colors.brandPrimary : colors.onSurface, fontWeight: categoryId === c.id ? "700" : "400" }}>{c.name}</Text>
              {categoryId === c.id ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
            </Pressable>
            <Pressable onPress={() => removeCategory.mutate(c.id)} hitSlop={10} testID={`delete-category-${c.id}`}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </Pressable>
          </View>
        ))}
        <View style={{ marginTop: spacing.md }}>
          <LabeledInput label="Kategori baru" placeholder="contoh: Pendidikan" value={newCatName} onChangeText={setNewCatName} testID="new-category-input" />
          <PrimaryButton
            label="Tambah Kategori"
            onPress={() => {
              if (!newCatName.trim()) return toast.show("Isi nama kategori", "error");
              addCategory.mutate();
            }}
            loading={addCategory.isPending}
            testID="create-category-button"
            style={{ marginTop: spacing.md }}
          />
        </View>
      </SheetModal>

      {/* Date picker */}
      {Platform.OS === "ios" ? (
        <SheetModal visible={dateSheet} onClose={() => setDateSheet(false)} title="Pilih Tanggal" testID="date-sheet">
          <DateTimePicker
            value={dayjs(date).toDate()}
            mode="date"
            display="spinner"
            onChange={(e, d) => {
              if (d) setDate(dayjs(d).format("YYYY-MM-DD"));
            }}
          />
        </SheetModal>
      ) : Platform.OS === "android" ? (
        dateSheet ? (
          <DateTimePicker
            value={dayjs(date).toDate()}
            mode="date"
            display="default"
            onChange={(e, d) => {
              setDateSheet(false);
              if (d) setDate(dayjs(d).format("YYYY-MM-DD"));
            }}
          />
        ) : null
      ) : (
        <SheetModal visible={dateSheet} onClose={() => setDateSheet(false)} title="Pilih Tanggal" testID="date-sheet">
          <LabeledInput label="Tanggal (YYYY-MM-DD)" placeholder="2026-06-14" value={customDate} onChangeText={setCustomDate} autoCapitalize="none" testID="custom-date-input" />
          <PrimaryButton
            label="Pakai Tanggal Ini"
            onPress={() => {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) return toast.show("Format tanggal: YYYY-MM-DD", "error");
              setDate(customDate);
              setCustomDate("");
              setDateSheet(false);
            }}
            testID="apply-custom-date-button"
            style={{ marginTop: spacing.md }}
          />
        </SheetModal>
      )}

      {/* Photo source / permission sheet */}
      <SheetModal visible={sourceSheet !== null} onClose={() => setSourceSheet(null)} title={sourceSheet === "denied" ? "Izin dibutuhkan" : "Foto Struk"} testID="photo-source-sheet">
        {sourceSheet === "denied" ? (
          <>
            <Text style={styles.sheetText}>Izin kamera/galeri ditolak sebelumnya. Aktifkan lewat pengaturan perangkat agar bisa melampirkan struk.</Text>
            <PrimaryButton
              label="Buka Pengaturan"
              onPress={() => {
                setSourceSheet(null);
                Linking.openSettings();
              }}
              testID="open-settings-photo-button"
              style={{ marginTop: spacing.md }}
            />
          </>
        ) : (
          <>
            <Text style={styles.sheetText}>Lampirkan foto struk sebagai bukti transaksi. Kamu bisa memakai kamera atau galeri.</Text>
            <PrimaryButton label="Ambil dengan Kamera" onPress={() => pickImage(true)} testID="pick-camera-button" style={{ marginTop: spacing.md }} />
            <PrimaryButton label="Pilih dari Galeri" onPress={() => pickImage(false)} variant="ghost" testID="pick-gallery-button" style={{ marginTop: spacing.sm }} />
          </>
        )}
      </SheetModal>
    </View>
  );
}

function SegmentType({ type, onChange }: { type: TxType; onChange: (t: TxType) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const options: { value: TxType; label: string; icon: string }[] = [
    { value: "expense", label: "Pengeluaran", icon: "arrow-up" },
    { value: "income", label: "Pemasukan", icon: "arrow-down" },
  ];
  return (
    <View style={[styles.segmented, { borderColor: colors.border }]}>
      {options.map((o) => {
        const active = o.value === type;
        return (
          <Pressable
            key={o.value}
            testID={`type-segment-${o.value}`}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, { flexDirection: "row", gap: 6 }, active && { backgroundColor: o.value === "income" ? colors.success : colors.brandPrimary, borderRadius: radius.sm }]}>
            <Ionicons name={o.icon as any} size={16} color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[styles.segmentLabel, { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Skeleton({ height, width }: { height: number; width?: number }) {
  const styles = useStyles();
  return <View style={[styles.skeleton, { height, width }]} />;
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
    marginBottom: spacing.lg,
  },
  inputLabel: {
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
  photoBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
    minHeight: 110,
  },
  photoBoxText: {
    fontSize: 13,
    color: colors.muted,
  },
  photoPreview: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  photoRemove: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
  },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sheetText: {
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    lineHeight: 20,
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
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  skeleton: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
  },
}));
