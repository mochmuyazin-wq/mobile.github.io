import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { FONT_FAMILY, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { formatIDR, timeLabel } from "@/src/lib/format";
import type { Transaction } from "@/src/lib/api";

const ICON_NAMES: Record<string, any> = {
  restaurant: "restaurant",
  car: "car",
  receipt: "receipt",
  "game-controller": "game-controller",
  wallet: "wallet",
  cart: "cart",
  medkit: "medkit",
  "ellipsis-horizontal": "ellipsis-horizontal",
  pricetag: "pricetag",
  home: "home",
  film: "film",
  gift: "gift",
  heart: "heart",
};

export function CategoryIcon({ icon, isExpense }: { icon: string; isExpense: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const name = ICON_NAMES[icon] ?? "pricetag";
  return (
    <View style={[styles.iconCircle, { backgroundColor: isExpense ? colors.surfaceTertiary : colors.brandTertiary }]}>
      <Ionicons name={name} size={17} color={isExpense ? colors.onSurfaceTertiary : colors.brandPrimary} />
    </View>
  );
}

interface TransactionRowProps {
  tx: Transaction;
  onPress?: () => void;
  testID?: string;
}

export function TransactionRow({ tx, onPress, testID }: TransactionRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isExpense = tx.type === "expense";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      accessibilityRole="button">
      <CategoryIcon icon={tx.category_icon} isExpense={isExpense} />
      <View style={styles.midCol}>
        <Text style={styles.title} numberOfLines={1}>
          {tx.note?.trim() ? tx.note : tx.category_name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {tx.category_name} • {tx.created_by_name} • {timeLabel(tx.created_at)}
        </Text>
      </View>
      <Text style={[styles.amount, { color: isExpense ? colors.onSurface : colors.success }]}>
        {isExpense ? "-" : "+"}
        {formatIDR(tx.amount)}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  midCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.onSurface,
    fontFamily: FONT_FAMILY,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
  },
  amount: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: FONT_FAMILY,
  },
}));
