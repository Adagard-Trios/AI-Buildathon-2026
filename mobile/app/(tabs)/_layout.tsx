import { Redirect, Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

import { useApp } from "../../src/state/app";
import { c } from "../../src/ui/theme";

// Plain glyphs keep the icon set dependency-free; labels carry the meaning.
const glyph = (g: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 20 }}>{g}</Text>;
  };

export default function TabsLayout() {
  const { user, t } = useApp();
  if (!user) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tabHome"), tabBarIcon: glyph("⌂") }} />
      <Tabs.Screen name="check" options={{ title: t("tabCheck"), tabBarIcon: glyph("✓") }} />
      <Tabs.Screen name="money" options={{ title: t("tabMoney"), tabBarIcon: glyph("₨") }} />
      <Tabs.Screen name="ask" options={{ title: t("tabAsk"), tabBarIcon: glyph("?") }} />
      <Tabs.Screen name="me" options={{ title: t("tabMe"), tabBarIcon: glyph("●") }} />
    </Tabs>
  );
}
