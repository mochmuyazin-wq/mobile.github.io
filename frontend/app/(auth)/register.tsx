import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { registerUser, setToken } from "@/src/lib/api";
import { LabeledInput, PrimaryButton } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useMe } from "@/src/lib/queries";
import { queryClient } from "@/src/query-client";
import { FONT_FAMILY, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const toast = useToast();
  const me = useMe();

  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (me.data) router.replace("/(tabs)/beranda" as any);
  }, [me.data]);

  const submit = async () => {
    if (!name.trim()) return toast.show("Isi nama kamu dulu", "error");
    if (!identifier.trim()) return toast.show("Isi email atau No. HP", "error");
    if (password.length < 8) return toast.show("Password minimal 8 karakter", "error");
    setLoading(true);
    try {
      const res = await registerUser(name.trim(), identifier.trim(), password);
      await setToken(res.access_token);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/(tabs)/beranda" as any);
    } catch (e: any) {
      toast.show(e?.message ?? "Gagal mendaftar", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.brandPrimary, colors.brandSecondary]} style={styles.logo}>
          <Ionicons name="people" size={32} color={colors.onBrandPrimary} />
        </LinearGradient>
        <Text style={styles.title}>Buat akun baru</Text>
        <Text style={styles.subtitle}>Satu akun per orang. Nanti hubungkan dengan pasangan lewat kode undangan</Text>

        <View style={styles.form}>
          <LabeledInput label="Nama Kamu" placeholder="contoh: Budi" value={name} onChangeText={setName} testID="register-name-input" />
          <LabeledInput
            label="Email atau No. HP"
            placeholder="contoh: budi@email.com atau 081234567890"
            autoCapitalize="none"
            keyboardType="email-address"
            value={identifier}
            onChangeText={setIdentifier}
            testID="register-identifier-input"
          />
          <LabeledInput
            label="Password (minimal 8 karakter)"
            placeholder="Buat password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            testID="register-password-input"
          />
        </View>

        <View style={{ height: 120 }} />
      </KeyboardAwareScrollView>

      <KeyboardStickyView style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        <PrimaryButton label="Daftar" onPress={submit} loading={loading} testID="register-submit-button" />
        <Pressable onPress={() => router.back()} style={styles.switchRow} testID="go-to-login">
          <Text style={styles.switchText}>
            Sudah punya akun? <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Masuk</Text>
          </Text>
        </Pressable>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scroll: {
    padding: spacing.xl,
    paddingTop: spacing.xxxl - 24,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.onSurface,
    fontFamily: FONT_FAMILY,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.lg,
  },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  switchRow: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  switchText: {
    fontSize: 13,
    color: colors.muted,
  },
}));
