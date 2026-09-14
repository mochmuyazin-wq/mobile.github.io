import { type ReactNode, useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMe } from "@/src/lib/queries";
import { Skeleton } from "@/src/components/ui";
import { makeStyles, spacing } from "@/src/theme";

// Wraps protected screens: renders children only for a signed-in user,
// otherwise redirects to the login flow.
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  useEffect(() => {
    if (me.isError) router.replace("/(auth)/login" as any);
  }, [me.isError]);

  if (me.isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }]} testID="auth-gate-loading">
        <Skeleton height={24} style={{ width: "50%" }} />
        <Skeleton height={140} style={{ marginTop: spacing.lg }} />
        <Skeleton height={200} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }
  if (me.isError) return null;
  return <>{children}</>;
}

const useStyles = makeStyles(() => ({
  screen: { flex: 1 },
}));
