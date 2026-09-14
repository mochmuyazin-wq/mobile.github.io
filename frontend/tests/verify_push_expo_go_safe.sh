#!/usr/bin/env bash
# Simulate Expo Go evaluation of push.ts and prove module-scope safety.
set -e
cd /app/frontend

# 1) Transpile push.ts to CJS with esbuild, rewriting the "@/" alias to a
#    relative path so the CJS require() resolves.
esbuild src/lib/push.ts \
  --bundle=false \
  --loader:.ts=ts \
  --format=cjs \
  --platform=node \
  --target=node18 \
  --outfile=/tmp/push.cjs.js \
  --log-level=silent

# 2) Rewrite alias imports "@/src/..." -> relative
sed -i 's#require("@/src/utils/storage")#require("__STORAGE__")#g; s#require("@/src/lib/api")#require("__API__")#g' /tmp/push.cjs.js

# 3) Node harness that mocks Expo Go environment: Notifications.* throws,
#    Constants.appOwnership === "expo", Platform.OS === "android".
cat > /tmp/harness.js <<'JS'
const Module = require("module");
const path = require("path");

const throwingNotifs = new Proxy(
  {
    AndroidImportance: new Proxy({}, {
      get: () => { throw new Error("[MOCK] AndroidImportance touched"); }
    })
  },
  { get(t, p) {
      if (p in t) return t[p];
      return () => { throw new Error(`[MOCK] Notifications.${String(p)} removed in Expo Go`); };
    }
  }
);

const originalLoad = Module._load;
Module._load = function (req, parent, ...rest) {
  if (req === "expo-notifications") return throwingNotifs;
  if (req === "expo-constants") return { default: { appOwnership: "expo" }, appOwnership: "expo" };
  if (req === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}] };
  if (req === "react-native") return { Platform: { OS: "android" }, Linking: { openSettings: () => {} } };
  if (req === "__STORAGE__") return { storage: { getItem: async () => null, setItem: async () => {} } };
  if (req === "__API__") return { registerPushToken: async () => {} };
  return originalLoad.call(this, req, parent, ...rest);
};

let pass = true;
try {
  const mod = require("/tmp/push.cjs.js");
  console.log("PASS: module evaluated with expo-notifications native calls MOCKED to throw");
  console.log("Exports:", Object.keys(mod));
  const r = mod.registerForPush("uid");
  if (r && r.then) r.then(() => console.log("PASS: registerForPush is a no-op in Expo Go"))
                   .catch(e => { console.error("FAIL registerForPush:", e.message); pass = false; });
} catch (e) {
  console.error("FAIL: module-scope threw ->", e.message);
  pass = false;
}
setTimeout(() => process.exit(pass ? 0 : 1), 300);
JS

node /tmp/harness.js
echo "---"
echo "Now testing the OPPOSITE case (native build): Notifications should be called"

# 4) Same but Constants.appOwnership !== "expo" (simulate dev build)
cat > /tmp/harness2.js <<'JS'
const Module = require("module");
let called = { setNotificationHandler: 0, setNotificationChannelAsync: 0 };
const activeNotifs = {
  AndroidImportance: { MAX: 5 },
  setNotificationHandler: () => { called.setNotificationHandler++; },
  setNotificationChannelAsync: async () => { called.setNotificationChannelAsync++; },
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponseAsync: async () => null,
  requestPermissionsAsync: async () => ({ status: "denied" }),
  getPermissionsAsync: async () => ({ status: "granted", canAskAgain: true }),
  getDevicePushTokenAsync: async () => ({ data: "TOKEN" }),
};
const originalLoad = Module._load;
Module._load = function (req, parent, ...rest) {
  if (req === "expo-notifications") return activeNotifs;
  if (req === "expo-constants") return { default: { appOwnership: "standalone" }, appOwnership: "standalone" };
  if (req === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}] };
  if (req === "react-native") return { Platform: { OS: "android" }, Linking: { openSettings: () => {} } };
  if (req === "__STORAGE__") return { storage: { getItem: async () => null, setItem: async () => {} } };
  if (req === "__API__") return { registerPushToken: async () => {} };
  return originalLoad.call(this, req, parent, ...rest);
};
try {
  require("/tmp/push.cjs.js");
  setTimeout(() => {
    if (called.setNotificationHandler === 1 && called.setNotificationChannelAsync === 1) {
      console.log("PASS: in dev-build path, handler + android channel WERE invoked at module scope");
      process.exit(0);
    } else {
      console.error("FAIL: dev-build path did not invoke native calls", called);
      process.exit(1);
    }
  }, 200);
} catch (e) {
  console.error("FAIL dev-build simulate:", e.message);
  process.exit(1);
}
JS
node /tmp/harness2.js
