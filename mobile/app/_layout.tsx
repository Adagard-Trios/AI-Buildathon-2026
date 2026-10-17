import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppProvider, useApp } from "../src/state/app";
import { Loading } from "../src/ui/components";
import { c } from "../src/ui/theme";

function Navigator() {
  const { ready, t } = useApp();
  if (!ready) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: c.brand,
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "700", color: c.text },
        contentStyle: { backgroundColor: c.bg },
        headerBackTitle: "",
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: t("signIn") }} />
      <Stack.Screen name="sign-up" options={{ title: t("signUp") }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="portfolio/new" options={{ title: t("addPortfolio") }} />
      <Stack.Screen name="portfolio/import" options={{ title: t("fromPhoto") }} />
      <Stack.Screen name="portfolio/[id]" options={{ title: t("holdings") }} />
      <Stack.Screen name="plan" options={{ title: t("planTitle") }} />
      <Stack.Screen name="send" options={{ title: t("sendTitle") }} />
      <Stack.Screen name="receipts" options={{ title: t("receipts") }} />
      <Stack.Screen name="guardian" options={{ title: t("guardianTitle") }} />
      <Stack.Screen name="servers" options={{ title: t("servers") }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppProvider>
        <Navigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}
