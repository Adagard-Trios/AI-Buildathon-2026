import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import * as api from "../../src/api/endpoints";
import type { PendingAction, PortfolioSummary } from "../../src/api/types";
import { money } from "../../src/lib/money";
import { useApp, useUser } from "../../src/state/app";
import { store, type CheckRecord } from "../../src/state/store";
import { Button, Card, Gap, Pill, Row, Screen } from "../../src/ui/components";
import { c, s, type } from "../../src/ui/theme";
import { levelLabel, levelTone } from "../../src/ui/verdict";

export default function Home() {
  const { t } = useApp();
  const user = useUser();
  const [portfolios, setPortfolios] = useState<PortfolioSummary[] | null>(null);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [checks, setChecks] = useState<CheckRecord[]>([]);

  // Refresh whenever Home comes back into view: a check or plan elsewhere changes it.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        setChecks(await store.checks(user.id));
        // Each panel fails on its own: a down service must not blank the whole home screen.
        api.listPortfolios().then((p) => live && setPortfolios(p)).catch(() => live && setPortfolios([]));
        api.pendingActions().then((p) => live && setPending(p)).catch(() => undefined);
      })();
      return () => {
        live = false;
      };
    }, [user.id]),
  );

  const total = (portfolios ?? []).reduce((sum, p) => sum + p.total_value, 0);
  const currency = portfolios?.[0]?.base_currency ?? "LKR";

  return (
    <Screen>
      <Text style={type.small}>{t("hello")},</Text>
      <Text style={type.title}>{user.display_name}</Text>
      <Gap size={s.lg} />

      <Pressable onPress={() => router.push("/(tabs)/check")} accessibilityRole="button">
        <Card style={{ backgroundColor: c.brand, borderColor: c.brand }}>
          <Text style={[type.h2, { color: "#fff" }]}>{t("homeCheckTitle")}</Text>
          <Gap size={s.sm} />
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>{t("homeCheckCta")} →</Text>
        </Card>
      </Pressable>

      {pending.length ? (
        <Card style={{ borderColor: c.warn }}>
          <Text style={type.h2}>{t("homePending")}</Text>
          {pending.slice(0, 3).map((p) => (
            <Row key={p.Id} left={p.Summary || p.Kind} sub={p.To ?? undefined} />
          ))}
          <Gap />
          <Button label={t("pendingTitle")} variant="secondary" onPress={() => router.push("/guardian")} />
        </Card>
      ) : null}

      <Card>
        <Text style={type.small}>{t("homeTotal")}</Text>
        <Text style={type.big}>{portfolios === null ? "…" : money(total, currency)}</Text>
        <Gap />
        <View style={{ flexDirection: "row", gap: s.md }}>
          <View style={{ flex: 1 }}>
            <Button label={t("homeRaiseCash")} onPress={() => router.push("/plan")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t("homeSend")} variant="secondary" onPress={() => router.push("/send")} />
          </View>
        </View>
      </Card>

      <Card>
        <Text style={type.h2}>{t("homeRecent")}</Text>
        {checks.length === 0 ? <Text style={[type.small, { marginTop: s.sm }]}>{t("nothingYet")}</Text> : null}
        {checks.map((r) => (
          <View key={r.id} style={{ paddingVertical: s.sm, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <Pill text={levelLabel(t, r.level)} tone={levelTone(r.level)} />
            <Text style={type.small} numberOfLines={1}>
              {r.preview}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
