import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { getToken, getMe } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";

// Entry gate: decides between the auth flow and the main tabs.
export default function Gate() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        router.replace("/(auth)/login" as any);
        return;
      }
      try {
        await getMe();
        router.replace("/(tabs)/beranda" as any);
      } catch {
        router.replace("/(auth)/login" as any);
      }
    })().finally(() => setChecked(true));
  }, []);

  return <View style={[styles.splash, { backgroundColor: colors.surface }]} testID="gate-splash" />;
}

const useStyles = makeStyles(() => ({
  splash: { flex: 1 },
}));
