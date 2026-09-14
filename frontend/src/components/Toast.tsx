import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type ToastType = "success" | "error" | "info";
interface ToastState {
  message: string;
  type: ToastType;
  key: number;
}

const ToastContext = createContext<{ show: (message: string, type?: ToastType) => void }>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const styles = useStyles();

  const show = useCallback((message: string, type: ToastType = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, type, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  const iconName = toast?.type === "success" ? "checkmark-circle" : toast?.type === "error" ? "alert-circle" : "information-circle";
  const iconColor = toast?.type === "success" ? colors.success : toast?.type === "error" ? colors.error : colors.info;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          testID={`toast-${toast.type}`}
          style={[styles.toast, { top: insets.top + spacing.sm, backgroundColor: scheme === "dark" ? colors.surfaceSecondary : colors.surfaceInverse }]}
          pointerEvents="none">
          <Ionicons name={iconName} size={18} color={iconColor} />
          <Text style={[styles.message, { color: scheme === "dark" ? colors.onSurface : colors.onSurfaceInverse }]} numberOfLines={3}>
            {toast.message}
          </Text>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const useStyles = makeStyles((colors) => ({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    // Shadow (light) / border (dark) to lift off content.
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
}));
