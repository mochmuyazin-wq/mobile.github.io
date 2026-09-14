// Emergent managed push: foreground handler + Android channel at module scope,
// tap handlers + registration + denied-permission nudge in effects.
//
// IMPORTANT: remote push (and the channel API on Android) is REMOVED from Expo
// Go since SDK 53 — calling it there throws "Android Push notifications ...
// was removed from Expo Go", which at module scope crashes the root layout
// evaluation. So every call is gated on Expo Go ownership and wrapped defensively;
// in-app notifications keep working everywhere, native push activates in a
// development/production build (after deploy).

import { useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { storage } from "@/src/utils/storage";
import { registerPushToken } from "@/src/lib/api";

const IN_EXPO_GO = Constants.appOwnership === "expo";
const PUSH_AVAILABLE = Platform.OS !== "web" && !IN_EXPO_GO;

if (PUSH_AVAILABLE) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn("[push] handler setup skipped:", e);
  }
}

if (Platform.OS === "android" && PUSH_AVAILABLE) {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  }).catch((e) => console.warn("[push] channel setup skipped:", e));
}

function routeFromData(data: any): string | null {
  const url = data?.deeplink || data?.action_url;
  if (!url || typeof url !== "string") return null;
  return url;
}

export function usePushTapHandler(router: { push: (href: string) => void }) {
  useEffect(() => {
    if (!PUSH_AVAILABLE) return;
    let tapSub: { remove: () => void } | null = null;
    try {
      tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
        const url = routeFromData(response.notification.request.content.data);
        if (url) router.push(url);
      });
    } catch (e) {
      console.warn("[push] tap listener skipped:", e);
      return;
    }
    Notifications.getLastNotificationResponseAsync?.()
      .then((response) => {
        if (!response) return;
        const url = routeFromData(response.notification.request.content.data);
        if (url) router.push(url);
      })
      .catch(() => {});
    return () => {
      tapSub?.remove();
    };
  }, []);
}

export async function registerForPush(user_id: string) {
  if (!PUSH_AVAILABLE) return;
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
    if (!PUSH_AVAILABLE) return;
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const lastNudge = await storage.getItem("push_nudge_at", null);
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
        setShow(true);
      } catch (e) {
        console.warn("[push] nudge check skipped:", e);
      }
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
