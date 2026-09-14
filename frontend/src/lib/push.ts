// Emergent managed push: foreground handler + Android channel, tap handlers,
// registration + denied-permission nudge.
//
// IMPORTANT: merely IMPORTING expo-notifications in Expo Go (Android) throws
// "Android Push notifications ... was removed from Expo Go with the release of
// SDK 53" — the module has an import-time side effect
// (DevicePushTokenAutoRegistration -> addPushTokenListener -> throw). So the
// library is NOT statically imported: it is required lazily and ONLY inside a
// development/production build (never on web, never in Expo Go). In Expo Go the
// app runs with in-app notifications only; push activates after deploy+build.

import { useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { storage } from "@/src/utils/storage";
import { registerPushToken } from "@/src/lib/api";

type NotificationsModule = typeof import("expo-notifications");

const IN_EXPO_GO = Constants.appOwnership === "expo";
const PUSH_AVAILABLE = Platform.OS !== "web" && !IN_EXPO_GO;

let Notifications: NotificationsModule | null = null;
if (PUSH_AVAILABLE) {
  try {
    // Executes the module only where push is supported (native dev/prod build).
    Notifications = require("expo-notifications") as NotificationsModule;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
      }).catch((e) => console.warn("[push] channel setup skipped:", e));
    }
  } catch (e) {
    console.warn("[push] setup skipped:", e);
    Notifications = null;
  }
}

function routeFromData(data: any): string | null {
  const url = data?.deeplink || data?.action_url;
  if (!url || typeof url !== "string") return null;
  return url;
}

export function usePushTapHandler(router: { push: (href: string) => void }) {
  useEffect(() => {
    if (!PUSH_AVAILABLE || !Notifications) return;
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
  if (!PUSH_AVAILABLE || !Notifications) return;
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
    if (!PUSH_AVAILABLE || !Notifications) return;
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
