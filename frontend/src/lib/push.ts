// Emergent managed push: foreground handler + Android channel at module scope,
// tap handlers + registration + denied-permission nudge in effects.

import { useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { storage } from "@/src/utils/storage";
import { registerPushToken } from "@/src/lib/api";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function routeFromData(data: any): string | null {
  const url = data?.deeplink || data?.action_url;
  if (!url || typeof url !== "string") return null;
  return url;
}

export function usePushTapHandler(router: { push: (href: string) => void }) {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = routeFromData(response.notification.request.content.data);
      if (url) router.push(url);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const url = routeFromData(response.notification.request.content.data);
      if (url) router.push(url);
    });
    return () => {
      tapSub.remove();
    };
  }, []);
}

export async function registerForPush(user_id: string) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await registerPushToken(user_id, Platform.OS === "ios" ? "ios" : "android", tokenResp.data as string);
  } catch (e) {
    console.warn("[push] registration skipped:", e);
  }
}

// Weekly nudge when notifications were permanently denied; returns whether a
// nudge should be shown right now and stamps it once shown.
export function usePushNudge(): [boolean, () => void, () => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const lastNudge = await storage.getItem("push_nudge_at", null);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
      setShow(true);
    })();
  }, []);
  const dismiss = async () => {
    await storage.setItem("push_nudge_at", Date.now());
    setShow(false);
  };
  const openSettings = async () => {
    await storage.setItem("push_nudge_at", Date.now());
    setShow(false);
    Linking.openSettings();
  };
  return [show, openSettings, dismiss];
}
