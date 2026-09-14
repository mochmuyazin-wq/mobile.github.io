import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearToken, createInvite, joinWallet } from "@/src/lib/api";
import { useMe, useNotifications, useWallet } from "@/src/lib/queries";
import { Avatar, Card, LabeledInput, PrimaryButton, SectionTitle } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { AuthGate } from "@/src/components/AuthGate";
import { setColorScheme, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { initials } from "@/src/lib/format";
import { storage } from "@/src/utils/storage";

export default function ProfilScreen() {
  return (
    <AuthGate>
      <ProfilInner />
    </AuthGate>
  );
}

function ProfilInner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useMe();
  const wallet = useWallet();
  const notifications = useNotifications();

  const [joinCode, setJoinCode] = useState("");

  const invite = wallet.data?.invite ?? null;
  const partner = (wallet.data?.members ?? []).find((m) => m.id !== me.data?.id);

  const createInviteMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: () => {
      toast.show("Kode undangan dibuat", "success");
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Gagal membuat kode", "error"),
  });

  const join = useMutation({
    mutationFn: () => joinWallet(joinCode.trim()),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show("Berhasil terhubung dengan pasangan!", "success");
      setJoinCode("");
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Gagal bergabung", "error"),
  });

  const copyCode = async () => {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.code);
    toast.show("Kode disalin", "success");
  };

  const logout = async () => {
    await clearToken();
    queryClient.clear();
    router.replace("/(auth)/login" as any);
  };

  const toggleTheme = (v: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setColorScheme(v ? "dark" : "light");
    storage.setItem("theme_mode", v ? "dark" : "light");
  };

  const unread = notifications.data?.unread ?? 0;

  if (me.isLoading) return <View style={[styles.screen, { paddingTop: insets.top }]} testID="profil-loading" />;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="profil-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profil</Text>

        {/* User card */}
        <Card style={{ marginBottom: spacing.lg }} testID="profile-user-card">
          <View style={styles.userRow}>
            <Avatar initials={initials(me.data?.name)} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{me.data?.name}</Text>
              <Text style={styles.userContact}>{me.data?.email ?? me.data?.phone ?? ""}</Text>
            </View>
          </View>
        </Card>

        {/* Wallet / pairing card */}
        <Card style={{ marginBottom: spacing.lg }} testID="wallet-card">
          <SectionTitle>Dompet Bersama</SectionTitle>
          {partner ? (
            <View>
              <View style={[styles.partnerRow, { borderColor: colors.border }]}>
                <Avatar initials={initials(partner.name)} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.partnerName}>{partner.name}</Text>
                  <View style={[styles.connectedBadge, { backgroundColor: colors.brandTertiary }]}>
                    <Ionicons name="link" size={11} color={colors.onBrandTertiary} />
                    <Text style={[styles.connectedText, { color: colors.onBrandTertiary }]}>Terhubung</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.hintText}>Semua transaksi kalian masuk ke satu dompet yang sama</Text>
            </View>
          ) : (
            <View>
              <Text style={styles.hintText}>Hubungkan akun pasanganmu supaya bisa mencatat keuangan bersama secara real-time</Text>

              {invite ? (
                <View style={[styles.codeBox, { borderColor: colors.border }]}>
                  <Text style={styles.codeLabel}>Kode Undangan (berlaku 24 jam)</Text>
                  <Pressable onPress={copyCode} testID="copy-invite-code" style={styles.codeRow}>
                    <Text style={styles.codeValue} testID="invite-code-value">{invite.code}</Text>
                    <Ionicons name="copy" size={18} color={colors.brandPrimary} />
                  </Pressable>
                </View>
              ) : (
                <PrimaryButton label="Buat Kode Undangan" onPress={() => createInviteMutation.mutate()} loading={createInviteMutation.isPending} testID="create-invite-button" />
              )}

              <View style={styles.orRow}>
                <View style={[styles.orLine, { backgroundColor: colors.border }]} />
                <Text style={styles.orText}>atau</Text>
                <View style={[styles.orLine, { backgroundColor: colors.border }]} />
              </View>

              <LabeledInput label="Punya kode dari pasangan?" placeholder="Masukkan 6 digit kode" value={joinCode} onChangeText={setJoinCode} keyboardType="number-pad" testID="join-code-input" />
              <PrimaryButton label="Gabung ke Dompet Pasangan" onPress={() => { if (!joinCode.trim()) return toast.show("Isi kode undangan", "error"); join.mutate(); }} loading={join.isPending} testID="join-wallet-button" style={{ marginTop: spacing.md }} />
            </View>
          )}
        </Card>

        {/* Menu rows */}
        <Card>
          <Pressable style={styles.menuRow} onPress={() => router.push("/notifications" as any)} testID="menu-notifications">
            <Ionicons name="notifications" size={20} color={colors.onSurfaceSecondary} />
            <Text style={styles.menuLabel}>Notifikasi</Text>
            {unread > 0 ? (
              <View style={[styles.unreadBadge, { backgroundColor: colors.error }]}>
                <Text style={styles.unreadText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <View style={[styles.menuRow, { borderBottomWidth: 0 }]}>
            <Ionicons name="moon" size={20} color={colors.onSurfaceSecondary} />
            <Text style={styles.menuLabel}>Mode Gelap</Text>
            <Switch
              value={scheme === "dark"}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
              thumbColor="#FFFFFF"
              testID="theme-toggle-switch"
            />
          </View>
        </Card>

        <PrimaryButton label="Keluar" variant="ghost" onPress={logout} testID="logout-button" style={{ marginTop: spacing.xl }} />
      </ScrollView>
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
    fontFamily: "PlusJakartaSans",
    marginBottom: spacing.lg,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  userName: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.onSurface,
  },
  userContact: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  partnerName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: 4,
  },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  connectedText: {
    fontSize: 11,
    fontWeight: "700",
  },
  hintText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  codeBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  codeLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 6,
    color: colors.brandPrimary,
    fontFamily: "PlusJakartaSans",
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  orLine: {
    flex: 1,
    height: 1,
  },
  orText: {
    fontSize: 12,
    color: colors.muted,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.onSurface,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
}));
