import { useEffect } from "react";
import { LogBox, Platform, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClientProvider } from "@tanstack/react-query";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { ToastProvider } from "@/src/components/Toast";
import { SheetModal } from "@/src/components/SheetModal";
import { PrimaryButton } from "@/src/components/ui";
import { useMe } from "@/src/lib/queries";
import { registerForPush, usePushNudge, usePushTapHandler } from "@/src/lib/push";
import { makeStyles, spacing, setColorScheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PlusJakartaSans: require("../assets/fonts/PlusJakartaSans.ttf") });

  // Re-apply persisted theme choice on launch.
  useEffect(() => {
    (async () => {
      const mode = await storage.getItem("theme_mode", null);
      if (mode === "dark" || mode === "light") setColorScheme(mode);
    })();
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <KeyboardProvider>
          <ToastProvider>
            <AppChrome />
            <Stack screenOptions={{ headerShown: false }} />
          </ToastProvider>
        </KeyboardProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

// Lives INSIDE QueryClientProvider so its hooks can use react-query.
function AppChrome() {
  const router = useRouter();
  const me = useMe();
  const [showNudge, openSettings, dismissNudge] = usePushNudge();

  // Tap handlers for push notifications (warm + cold start).
  usePushTapHandler(router as any);

  // Register native push token after login (also re-runs on token rotation).
  useEffect(() => {
    if (me.data?.id && Platform.OS !== "web") registerForPush(me.data.id);
  }, [me.data?.id]);

  return (
    <SheetModal visible={showNudge} onClose={dismissNudge} title="Notifikasi dimatikan" testID="push-nudge-sheet">
      <Text style={nudgeStyles.text}>
        Aktifkan notifikasi agar kamu langsung tahu saat pasangan menambah transaksi baru.
      </Text>
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <PrimaryButton label="Buka Pengaturan" onPress={openSettings} testID="push-nudge-open-settings" />
        <PrimaryButton label="Nanti" onPress={dismissNudge} variant="ghost" testID="push-nudge-later" />
      </View>
    </SheetModal>
  );
}

const nudgeStyles = makeStyles((colors) => ({
  text: {
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    lineHeight: 20,
  },
}));
