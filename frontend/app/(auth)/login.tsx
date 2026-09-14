import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { loginUser, setToken } from "@/src/lib/api";
import { LabeledInput, PrimaryButton } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useMe } from "@/src/lib/queries";
import { queryClient } from "@/src/query-client";
import { FONT_FAMILY, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const toast = useToast();
  const me = useMe();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (me.data) router.replace("/(tabs)/beranda" as any);
  }, [me.data]);

  const submit = async () => {
    if (!identifier.trim() || !password) {
      toast.show("Isi email/No. HP dan password dulu", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await loginUser(identifier.trim(), password);
      await setToken(res.access_token);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/(tabs)/beranda" as any);
    } catch (e: any) {
      toast.show(e?.message ?? "Gagal masuk", "error");
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
          <Ionicons name="wallet" size={34} color={colors.onBrandPrimary} />
        </LinearGradient>
        <Text style={styles.title}>Selamat datang kembali</Text>
        <Text style={styles.subtitle}>Masuk untuk melanjutkan dompet keuangan bersama pasanganmu</Text>

        <View style={styles.form}>
          <LabeledInput
            label="Email atau No. HP"
            placeholder="contoh: budi@email.com atau 081234567890"
            autoCapitalize="none"
            keyboardType="email-address"
            value={identifier}
            onChangeText={setIdentifier}
            testID="login-identifier-input"
          />
          <LabeledInput
            label="Password"
            placeholder="Password kamu"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            testID="login-password-input"
          />
        </View>

        <View style={{ height: 120 }} />
      </KeyboardAwareScrollView>

      <KeyboardStickyView style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        <PrimaryButton label="Masuk" onPress={submit} loading={loading} testID="login-submit-button" />
        <Pressable onPress={() => router.push("/(auth)/register" as any)} style={styles.switchRow} testID="go-to-register">
          <Text style={styles.switchText}>
            Belum punya akun? <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Daftar</Text>
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
