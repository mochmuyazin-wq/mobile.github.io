import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { FONT_FAMILY, makeStyles, radius, spacing, useTheme } from "@/src/theme";

// ---------------------------------------------------------------------------
// Screen scaffold
// ---------------------------------------------------------------------------

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buttons & chips
// ---------------------------------------------------------------------------

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "danger" | "ghost";
  testID?: string;
  style?: ViewStyle;
}

export function PrimaryButton({ label, onPress, loading, disabled, variant = "primary", testID, style }: PrimaryButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fgColor = variant === "danger" ? colors.onError : variant === "ghost" ? colors.brandPrimary : colors.onBrandPrimary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [styles.primaryButton, variant === "ghost" && styles.ghostButton, style, { opacity: disabled || loading ? 0.6 : pressed ? 0.85 : 1 }]}
      pointerEvents={disabled ? "none" : "auto"}>
      {loading ? (
        <ActivityIndicator color={fgColor} />
      ) : (
        <Text style={[styles.primaryButtonText, { color: fgColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}

export function Chip({ label, selected, onPress, testID }: ChipProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.brandPrimary : colors.surfaceSecondary,
          borderColor: selected ? colors.brandPrimary : colors.border,
        },
      ]}>
      <Text style={[styles.chipLabel, { color: selected ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>{label}</Text>
    </Pressable>
  );
}

interface SegmentedControlProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  testID?: string;
}

export function SegmentedControl({ options, value, onChange, testID }: SegmentedControlProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { borderColor: colors.border }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            testID={testID ? `${testID}-${opt.value}` : undefined}
            onPress={() => onChange(opt.value)}
            style={[styles.segmentItem, active && { backgroundColor: colors.brandPrimary, borderRadius: radius.sm }]}>
            <Text style={[styles.segmentLabel, { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

interface LabeledInputProps extends TextInputProps {
  label: string;
  error?: string | null;
  testID?: string;
}

export function LabeledInput({ label, error, testID, ...input }: LabeledInputProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: error ? colors.error : colors.border, color: colors.onSurface }]}
        {...input}
      />
      {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function ProgressBar({ pct, testID }: { pct: number; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const clamped = Math.min(Math.max(pct, 0), 1);
  const color = pct >= 1 ? colors.error : pct >= 0.8 ? colors.warning : colors.brandPrimary;
  return (
    <View style={styles.progressTrack} testID={testID}>
      <View style={[styles.progressFill, { width: `${clamped * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function EmptyState({ icon, title, message, testID }: { icon: string; title: string; message?: string; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.emptyState} testID={testID}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name={icon as any} size={26} color={colors.brandPrimary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry, testID }: { message?: string; onRetry: () => void; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.emptyState} testID={testID}>
      <Ionicons name="cloud-offline" size={30} color={colors.error} />
      <Text style={styles.emptyTitle}>{message ?? "Gagal memuat data"}</Text>
      <Pressable onPress={onRetry} style={[styles.retryButton]} testID={testID ? `${testID}-retry` : "retry-button"} accessibilityRole="button">
        <Text style={[styles.retryText, { color: colors.brandPrimary }]}>Coba lagi</Text>
      </Pressable>
    </View>
  );
}

export function Skeleton({ height = 16, style }: { height?: number; style?: ViewStyle }) {
  const styles = useStyles();
  return <View style={[styles.skeleton, { height }, style]} />;
}

export function Avatar({ initials: text, size = 44 }: { initials: string; size?: number }) {
  const styles = useStyles();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
    fontFamily: FONT_FAMILY,
  },
  primaryButton: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  ghostButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: FONT_FAMILY,
  },
  chip: {
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
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
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.xs + 2,
    fontFamily: FONT_FAMILY,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  errorText: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
    fontFamily: FONT_FAMILY,
  },
  emptyMessage: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 260,
  },
  retryButton: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "700",
  },
  skeleton: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
  },
  avatar: {
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.onBrandTertiary,
    fontWeight: "800",
    fontFamily: FONT_FAMILY,
  },
}));
