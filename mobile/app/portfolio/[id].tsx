import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Text } from "react-native";

import * as api from "../../src/api/endpoints";
import type { Holding } from "../../src/api/types";
import { holdingsValue, money } from "../../src/lib/money";
import { useApp } from "../../src/state/app";
import { errorText, useAsync } from "../../src/state/useAsync";
import { Button, Card, ErrorBox, Gap, Loading, Screen, Title } from "../../src/ui/components";
import { HoldingEditor } from "../../src/ui/HoldingEditor";
import { c, type } from "../../src/ui/theme";

export default function PortfolioDetail() {
  const { t } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pid = Number(id);
  const { data, error, loading, reload, setData } = useAsync(() => api.getPortfolio(pid), pid);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async (holdings: Holding[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      setData(await api.updatePortfolio(pid, { holdings }));
    } catch (e) {
      setSaveError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert(t("delete"), data?.name ?? "", [
      { text: "Cancel", style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          await api.deletePortfolio(pid);
          router.back();
        },
      },
    ]);

  if (loading && !data) return <Loading label={t("loading")} />;
  if (error || !data) return <Screen><ErrorBox message={error ?? "Not found"} onRetry={reload} retryLabel={t("retry")} /></Screen>;

  return (
    <Screen>
      <Title sub={data.base_currency}>{data.name}</Title>
      <Card>
        <Text style={type.small}>{t("value")}</Text>
        <Text style={type.big}>{money(holdingsValue(data.holdings), data.base_currency)}</Text>
      </Card>
      {saveError ? <ErrorBox message={saveError} /> : null}
      <HoldingEditor holdings={data.holdings} onChange={save} />
      {saving ? <Text style={[type.small, { color: c.muted }]}>{t("loading")}</Text> : null}
      <Gap />
      <Button label={t("homeRaiseCash")} onPress={() => router.push({ pathname: "/plan", params: { portfolio: String(pid) } })} disabled={!data.holdings.length} />
      <Gap />
      <Button label={t("delete")} variant="ghost" onPress={remove} />
    </Screen>
  );
}
