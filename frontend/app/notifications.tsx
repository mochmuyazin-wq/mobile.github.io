import { useEffect } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markNotificationsRead } from "@/src/lib/api";
import { useNotifications } from "@/src/lib/queries";
import { Card, EmptyState, Skeleton } from "@/src/components/ui";
import { AuthGate } from "@/src/components/AuthGate";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { relativeTimeID } from "@/src/lib/format";

const ICONS: Record<string, string> = {
  transaction: "receipt",
  budget: "wallet",
  pairing: "people",
};

export default function NotificationsScreen() {
  return (
    <AuthGate>
      <NotificationsInner />
    </AuthGate>
  );
}

function NotificationsInner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const notifications = useNotifications();

  const markRead = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = notifications.data?.unread ?? 0;
  useEffect(() => {
    if (unread > 0) {
      const t = setTimeout(() => markRead.mutate(), 1200);
      return () => clearTimeout(t);
    }
  }, [unread]);

  const items = notifications.data?.items ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="notifications-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} testID="notifications-back-button">
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Notifikasi</Text>
        {unread > 0 ? (
          <Pressable onPress={() => markRead.mutate()} testID="mark-all-read-button">
            <Text style={styles.markRead}>Tandai dibaca</Text>
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {notifications.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={64} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          ListEmptyComponent={
            <Card>
              <EmptyState icon="notifications" title="Belum ada notifikasi" message="Aktivitas pasanganmu akan muncul di sini" testID="notifications-empty" />
            </Card>
          }
          renderItem={({ item: n }) => (
            <Card style={[styles.row, !n.read && { borderLeftWidth: 3, borderLeftColor: colors.brandPrimary }]} testID={`notification-${n.id}`}>
              <View style={styles.iconCircle}>
                <Ionicons name={(ICONS[n.type] ?? "notifications") as any} size={17} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, !n.read && { fontWeight: "700" }]}>{n.title}</Text>
                <Text style={styles.rowMessage}>{n.message}</Text>
                <Text style={styles.rowTime}>{relativeTimeID(n.created_at)}</Text>
              </View>
              {!n.read ? <View style={[styles.dot, { backgroundColor: colors.brandPrimary }]} /> : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
  },
  markRead: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandPrimary,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.sm,
    alignItems: "center",
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.onSurface,
  },
  rowMessage: {
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    marginTop: 2,
  },
  rowTime: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
}));
