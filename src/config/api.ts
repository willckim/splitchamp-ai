import Constants from "expo-constants";

export const API_BASE =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE || null;

console.log("[SplitChamp] apiBase =", API_BASE);
