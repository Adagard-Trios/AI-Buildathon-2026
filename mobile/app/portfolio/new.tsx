import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import * as api from "../../src/api/endpoints";
import type { Holding } from "../../src/api/types";
import { useApp } from "../../src/state/app";
import { errorText } from "../../src/state/useAsync";
import { Text } from "react-native";

import { Banner, Button, ErrorBox, Field, Gap, Screen } from "../../src/ui/components";
import { type } from "../../src/ui/theme";
import { HoldingEditor } from "../../src/ui/HoldingEditor";

export default function NewPortfolio() {
  const { t } = useApp();
  // Holdings confirmed on the import screen arrive here as JSON, ready to save.
  const params = useLocalSearchParams<{ holdings?: string; missing?: string }>();
  const [name, setName] = useState("My shares");
  const [holdings, setHoldings] = useState<Holding[]>(() => (params.holdings ? (JSON.parse(params.holdings) as Holding[]) : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await api.createPortfolio(name.trim(), holdings);
      router.replace(`/portfolio/${p.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {error ? <ErrorBox message={error} /> : null}
      {params.missing ? (
        <Banner tone="warn" title={t("rejectedRows")}>
          <Text style={type.body}>No live price for {params.missing}. Add them below by share code.</Text>
        </Banner>
      ) : null}
      <Field label={t("portfolioName")} value={name} onChangeText={setName} />
      <HoldingEditor holdings={holdings} onChange={setHoldings} />
      <Gap />
      <Button label={t("save")} onPress={save} busy={busy} disabled={!name.trim()} />
    </Screen>
  );
}
