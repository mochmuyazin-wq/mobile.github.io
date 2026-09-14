import { Platform, Pressable } from "react-native";
import { Tabs } from "expo-router";
// NativeTabs.Trigger carries the Icon/Label components in this SDK version —
// there are no named `Icon`/`Label` exports on 'expo-router/unstable-native-tabs'.
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";

const { Icon, Label } = NativeTabs.Trigger;

const TABS: { name: string; label: string; icon: string; sf: string }[] = [
  { name: "beranda", label: "Beranda", icon: "home", sf: "house" },
  { name: "tambah", label: "Tambah", icon: "add-circle", sf: "plus.circle" },
  { name: "riwayat", label: "Riwayat", icon: "receipt", sf: "clock" },
  { name: "anggaran", label: "Anggaran", icon: "pie-chart", sf: "chart.pie" },
  { name: "profil", label: "Profil", icon: "person", sf: "person" },
];

// iOS 26+ gets native liquid-glass tabs; everything else uses the JS tab bar.
function useIsIos26() {
  return Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
}

function NativeIosTabs() {
  const { colors } = useTheme();
  return (
    <NativeTabs tintColor={colors.brandPrimary}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <Icon sf={tab.sf as any} />
          <Label>{tab.label}</Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

function JsTabs() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { ...(Platform.OS === "web" ? { height: 64 } : {}), backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarItemStyle: { alignSelf: "center" },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={(focused ? tab.icon : `${tab.icon}-outline`) as any} size={size ?? 22} color={color} />
            ),
            tabBarButton: (props: any) => <Pressable {...props} testID={`tab-${tab.name}`} />,
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabsLayout() {
  const isIos26 = useIsIos26();
  return isIos26 ? <NativeIosTabs /> : <JsTabs />;
}

const useStyles = makeStyles(() => ({}));
