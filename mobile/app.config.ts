import type { ExpoConfig } from "expo/config";

// Customer app for FirstStep. Service URLs come from EXPO_PUBLIC_*_URL at build time (the
// deployed Cloud Run stack); in development they default to the laptop running the Expo
// server (see src/lib/urls.ts).
const config: ExpoConfig = {
  name: "FirstStep",
  slug: "firststep",
  scheme: "firststep",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  backgroundColor: "#F6F7F9",
  ios: {
    bundleIdentifier: "com.adagardtrios.firststep",
    supportsTablet: false,
  },
  android: {
    package: "com.adagardtrios.firststep",
    allowBackup: false, // the session token is in the keystore; don't copy app data off-device
    blockedPermissions: ["android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE"],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        photosPermission: "Choose a photo of your broker statement so FirstStep can read your holdings.",
        cameraPermission: "Take a photo of your broker statement so FirstStep can read your holdings.",
      },
    ],
  ],
  experiments: { typedRoutes: false },
};

export default config;
