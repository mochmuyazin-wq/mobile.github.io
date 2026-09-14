// Static+runtime guarantee that /app/frontend/src/lib/push.ts CANNOT invoke
// any expo-notifications native API at module scope when running in Expo Go.
//
// Strategy: mock expo-constants so appOwnership === "expo" and mock
// expo-notifications so that ANY function property access throws (mimicking the
// Expo Go SDK-53 removal error). If the module load throws, the guard is
// broken. If it loads clean, PUSH_AVAILABLE=false is honored.

const path = require("path");
const Module = require("module");

const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

// Build a throwing Notifications proxy.
const throwingNotifs = new Proxy(
  {
    AndroidImportance: new Proxy(
      {},
      { get: () => { throw new Error("[MOCK] AndroidImportance accessed in Expo Go"); } }
    ),
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Any function-like call from module scope must throw like Expo Go does.
      return () => { throw new Error(`[MOCK] Notifications.${String(prop)} removed from Expo Go`); };
    },
  }
);

const mockConstants = { appOwnership: "expo", default: { appOwnership: "expo" } };

// Minimal react-native stub with Platform.OS === "android" (Expo Go typical).
const mockRN = {
  Platform: { OS: "android" },
  Linking: { openSettings: () => {} },
};

// react + storage/api stubs (only shape needed for module evaluation).
const mockReact = { useEffect: () => {}, useState: (v) => [v, () => {}] };
const mockStorage = { storage: { getItem: async () => null, setItem: async () => {} } };
const mockApi = { registerPushToken: async () => {} };

Module._load = function (request, parent, ...rest) {
  if (request === "expo-notifications") return throwingNotifs;
  if (request === "expo-constants") return { __esModule: true, default: mockConstants, ...mockConstants };
  if (request === "react-native") return mockRN;
  if (request === "react") return mockReact;
  if (request === "@/src/utils/storage") return mockStorage;
  if (request === "@/src/lib/api") return mockApi;
  return originalLoad.call(this, request, parent, ...rest);
};

// Register ts-node so we can require the .ts file.
try {
  require("ts-node/register/transpile-only");
} catch (e) {
  console.error("ts-node not available:", e.message);
  process.exit(2);
}

// Also alias '@' path
require("tsconfig-paths/register");

let ok = true;
try {
  const mod = require(path.resolve(__dirname, "..", "src/lib/push.ts"));
  console.log("MODULE LOADED OK — PUSH_AVAILABLE gate held");
  console.log("Exports:", Object.keys(mod));
  // Sanity: call registerForPush should be a no-op returning undefined
  const p = mod.registerForPush("test-user");
  if (p && typeof p.then === "function") {
    p.then(() => console.log("registerForPush no-op OK")).catch((e) => {
      console.error("registerForPush threw:", e.message);
      ok = false;
    });
  }
} catch (e) {
  console.error("MODULE LOAD FAILED (guard is broken):", e.message);
  ok = false;
}

setTimeout(() => process.exit(ok ? 0 : 1), 200);
