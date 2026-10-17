import { useState } from "react";
import { Text, View } from "react-native";

import * as api from "../api/endpoints";
import type { Holding } from "../api/types";
import { money } from "../lib/money";
import { useApp } from "../state/app";
import { errorText } from "../state/useAsync";
import { Button, Card, Field, Gap, Row } from "./components";
import { c, s, type } from "./theme";

/**
 * Add holdings by share code + quantity. Price and average daily traded value come from
 * Component 1's market quote, never typed by the user: the cash planner's liquidity maths is
 * only as good as those two numbers.
 */
export function HoldingEditor({ holdings, onChange }: { holdings: Holding[]; onChange: (h: Holding[]) => void }) {
  const { t } = useApp();
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const quantity = Number(qty.replace(/,/g, ""));
    if (!symbol.trim() || !(quantity > 0)) return;
    setBusy(true);
    setError(null);
    try {
      const q = await api.quote(symbol.trim().toUpperCase(), quantity);
      const h: Holding = {
        symbol: q.instrument.symbol,
        quantity,
        current_price: q.price,
        avg_daily_volume: q.avg_daily_volume,
      };
      onChange([...holdings.filter((x) => x.symbol !== h.symbol), h]);
      setSymbol("");
      setQty("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {holdings.map((h) => (
        <View key={h.symbol} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Row left={h.symbol} sub={`${h.quantity.toLocaleString()} × ${money(h.current_price)}`} right={money(h.quantity * h.current_price)} />
          </View>
          <Button label="✕" variant="ghost" onPress={() => onChange(holdings.filter((x) => x.symbol !== h.symbol))} />
        </View>
      ))}
      <Gap />
      <Card>
        <Text style={[type.h2, { marginBottom: s.md }]}>{t("addHolding")}</Text>
        <Field label={t("symbol")} value={symbol} onChangeText={setSymbol} autoCapitalize="characters" />
        <Field label={t("quantity")} value={qty} onChangeText={setQty} keyboardType="numeric" />
        {error ? <Text style={[type.small, { color: c.danger, marginBottom: s.sm }]}>{error}</Text> : null}
        <Button label={t("lookUp")} variant="secondary" onPress={add} busy={busy} disabled={!symbol.trim() || !qty} />
      </Card>
    </View>
  );
}
