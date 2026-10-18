import { SymbolView, type SFSymbol } from "expo-symbols";
import { Redirect, Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

import { useApp } from "../../src/state/app";
import { c } from "../../src/ui/theme";

// SF Symbols on iOS (filled, as the HIG prefers for tab bars) and Material Symbols on Android,
// both from expo-symbols, which ships with expo-router. The plain glyph is only the fallback.
const icon = (ios: SFSymbol, android: string, glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return (
      <SymbolView
        name={{ ios, android: android as never }}
        tintColor={color}
        size={24}
        fallback={<Text style={{ color, fontSize: 20 }}>{glyph}</Text>}
      />
    );
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
        // No fixed height or bottom padding: those replaced the home-indicator safe-area inset,
        // pushing labels under it on Face ID iPhones. The navigator sizes the bar itself.
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tabHome"), tabBarIcon: icon("house.fill", "home", "⌂") }} />
      <Tabs.Screen name="check" options={{ title: t("tabCheck"), tabBarIcon: icon("checkmark.shield.fill", "verified_user", "✓") }} />
      <Tabs.Screen name="money" options={{ title: t("tabMoney"), tabBarIcon: icon("banknote.fill", "payments", "₨") }} />
      <Tabs.Screen name="ask" options={{ title: t("tabAsk"), tabBarIcon: icon("bubble.left.and.bubble.right.fill", "forum", "?") }} />
      <Tabs.Screen name="me" options={{ title: t("tabMe"), tabBarIcon: icon("person.crop.circle.fill", "person", "●") }} />
    </Tabs>
  );
}
