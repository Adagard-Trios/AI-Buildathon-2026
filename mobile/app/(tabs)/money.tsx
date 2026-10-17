import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import * as api from "../../src/api/endpoints";
import { money } from "../../src/lib/money";
import { useApp } from "../../src/state/app";
import { useAsync } from "../../src/state/useAsync";
import { Button, Card, ErrorBox, Gap, Loading, Screen, Title } from "../../src/ui/components";
import { c, s, type } from "../../src/ui/theme";

export default function Money() {
  const { t } = useApp();
  const { data, error, loading, reload } = useAsync(() => api.listPortfolios());
  useFocusEffect(useCallback(() => void reload(), [reload]));

  return (
    <Screen>
      <Title>{t("moneyTitle")}</Title>
      {loading && !data ? <Loading label={t("loading")} /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} retryLabel={t("retry")} /> : null}
      {data?.length === 0 ? <Text style={[type.body, { color: c.muted, marginBottom: s.lg }]}>{t("nothingYet")}</Text> : null}
      {data?.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push(`/portfolio/${p.id}`)}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={type.h2}>{p.name}</Text>
                <Text style={type.small}>
                  {p.holding_count} {t("holdings").toLowerCase()}
                </Text>
              </View>
              <Text style={[type.h2, { color: c.brand }]}>{money(p.total_value, p.base_currency)}</Text>
            </View>
          </Card>
        </Pressable>
      ))}
      <Gap />
      <Button label={t("addPortfolio")} onPress={() => router.push("/portfolio/new")} />
      <Gap />
      <Button label={t("fromPhoto")} variant="secondary" onPress={() => router.push("/portfolio/import")} />
      <Gap />
      <Button label={t("homeRaiseCash")} variant="ghost" onPress={() => router.push("/plan")} />
    </Screen>
  );
}
