// Design tokens for this app. Light AND dark themes (Emerald accent, iOS-Native Clean).
//
// The keys match the "color" block of /app/design_guidelines.json (plus color_dark).
// Components build StyleSheets with makeStyles() and read useTheme().colors for
// color props. Hex literals in components only for colors identical in both themes.

import { useEffect, useMemo, useReducer } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

export const FONT_FAMILY = "PlusJakartaSans";

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

// Colors that must stay identical in light and dark (brand + chart series).
export const CHART_COLORS = ["#047857", "#34D399", "#0F766E", "#6EE7B7", "#10B981", "#A7F3D0", "#059669", "#D1FAE5"];

const light = {
  surface: "#FFFFFF",
  onSurface: "#18181B",
  surfaceSecondary: "#F4F4F5",
  onSurfaceSecondary: "#27272A",
  surfaceTertiary: "#E4E4E7",
  onSurfaceTertiary: "#3F3F46",
  surfaceInverse: "#18181B",
  onSurfaceInverse: "#FFFFFF",
  muted: "#71717A",

  brand: "#047857",
  onBrand: "#FFFFFF",
  brandPrimary: "#047857",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#10B981",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#D1FAE5",
  onBrandTertiary: "#064E3B",

  success: "#059669",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  border: "#E4E4E7",
  borderStrong: "#A1A1AA",
  divider: "#F4F4F5",
};

const dark = {
  surface: "#09090B",
  onSurface: "#FAFAFA",
  surfaceSecondary: "#18181B",
  onSurfaceSecondary: "#E4E4E7",
  surfaceTertiary: "#27272A",
  onSurfaceTertiary: "#D4D4D8",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#18181B",
  muted: "#A1A1AA",

  brand: "#10B981",
  onBrand: "#022C22",
  brandPrimary: "#10B981",
  onBrandPrimary: "#022C22",
  brandSecondary: "#059669",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#064E3B",
  onBrandTertiary: "#D1FAE5",

  success: "#10B981",
  onSuccess: "#022C22",
  warning: "#FBBF24",
  onWarning: "#451A03",
  error: "#F87171",
  onError: "#450A0A",
  info: "#60A5FA",
  onInfo: "#1E3A8A",

  border: "#27272A",
  borderStrong: "#52525B",
  divider: "#18181B",
};

export type ThemeColors = typeof light;

export const defaultScheme: ColorScheme = "light";

export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

// In-app theme toggle. react-native-web does not implement
// Appearance.setColorScheme, so we keep our own override + listeners and fall
// back to the device scheme. Persisting the choice and re-applying it on launch
// is the toggle's job (storage key "theme_mode" -> "light" | "dark" | null).
let schemeOverride: ColorScheme | null = null;
const schemeListeners = new Set<() => void>();

export function setColorScheme(scheme: ColorScheme | null) {
  // RN's Appearance.setColorScheme accepts 'unspecified' to fall back to the system.
  schemeListeners.forEach((l) => l());
  Appearance.setColorScheme?.(scheme === null ? "unspecified" : scheme);
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const [, forceUpdate] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    const listener = () => forceUpdate();
    schemeListeners.add(listener);
    return () => {
      schemeListeners.delete(listener);
    };
  }, []);
  const base: ColorScheme = system === "light" || system === "dark" ? system : defaultScheme;
  const scheme: ColorScheme = schemeOverride ?? base;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
