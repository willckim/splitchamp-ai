import 'dotenv/config';

export default {
  expo: {
    name: "SplitChamp AI",
    owner: "willckim",
    slug: "splitchamp-ai",
    version: "2.0.1",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    scheme: "splitchamp",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      bundleIdentifier: "com.willckim.splitchamp",
      buildNumber: "4",
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: "SplitChamp uses the camera to capture receipt photos for AI parsing."
      }
    },
    android: {
      package: "com.willckim.splitchamp",
      versionCode: 4,
      edgeToEdgeEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#60A5FA"
      },
      permissions: ["CAMERA"],
      usesCleartextTraffic: false,
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: false,
          data: [{ scheme: "splitchamp" }],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ],
      softwareKeyboardLayoutMode: "pan",
      useNextNotificationsApi: true
    },
    web: { favicon: "./assets/favicon.png" },
    plugins: [
      "expo-router",
      [
        "expo-build-properties",
        {
          android: { minSdkVersion: 24, targetSdkVersion: 35, compileSdkVersion: 35 },
          ios: { deploymentTarget: "15.1" }
        }
      ]
    ],
    runtimeVersion: { policy: "sdkVersion" },
    updates: { fallbackToCacheTimeout: 0 },
    extra: {
      EXPO_PUBLIC_API_BASE: process.env.EXPO_PUBLIC_API_BASE || "",
      supportEmail: "williamckim11@gmail.com",
      websiteUrl: "https://willckim.github.io/splitchamp-ai/",
      repoUrl: "https://github.com/willckim/splitchamp-ai",
      privacyUrl: "https://willckim.github.io/splitchamp-ai/privacy.html",
      termsUrl: "https://willckim.github.io/splitchamp-ai/terms.html",
      waitlistUrl: "https://forms.gle/B1oJoa56EnAavgBD6",
      eas: { projectId: "a2d2f44e-30e7-4821-b662-ac4da56c424d" }
    }
  }
};
