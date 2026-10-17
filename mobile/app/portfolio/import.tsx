import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Text, View } from "react-native";

import * as api from "../../src/api/endpoints";
import type { DraftHolding, Holding } from "../../src/api/types";
import { useApp } from "../../src/state/app";
import { errorText } from "../../src/state/useAsync";
import { Banner, Button, Card, ErrorBox, Gap, Loading, Row, Screen, Title } from "../../src/ui/components";
import { radius, s, type } from "../../src/ui/theme";

type Phase = "pick" | "reading" | "confirm" | "pricing";

export default function ImportStatement() {
  const { t } = useApp();
  const [phase, setPhase] = useState<Phase>("pick");
  const [uri, setUri] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftHolding[]>([]);
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [rejected, setRejected] = useState<{ index: number; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pick = async (camera: boolean) => {
    setError(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], base64: true, quality: 0.7 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]?.base64) return;
    const asset = res.assets[0];
    setUri(asset.uri);
    setPhase("reading");
    try {
      // Gemini reads the statement on the server; the result is a DRAFT for the user to confirm.
      const out = await api.importStatement(asset.base64!, asset.mimeType ?? "image/jpeg");
      setDrafts(out.draft_holdings);
      setKeep(Object.fromEntries(out.draft_holdings.map((d) => [d.symbol, true])));
      setRejected(out.rejected);
      setPhase("confirm");
    } catch (e) {
      setError(errorText(e));
      setPhase("pick");
    }
  };

  // Confirmed rows still need a live price and liquidity before they are a real Holding.
  const confirm = async () => {
    setPhase("pricing");
    setError(null);
    const out: Holding[] = [];
    const failed: string[] = [];
    for (const d of drafts.filter((x) => keep[x.symbol])) {
      try {
        const q = await api.quote(d.symbol, d.quantity);
        out.push({ symbol: q.instrument.symbol, quantity: d.quantity, current_price: q.price, avg_daily_volume: q.avg_daily_volume, cost_basis: d.avg_cost });
      } catch {
        failed.push(d.symbol);
      }
    }
    router.replace({ pathname: "/portfolio/new", params: { holdings: JSON.stringify(out), missing: failed.join(", ") } });
  };

  return (
    <Screen>
      <Title sub={t("photoHint")}>{t("fromPhoto")}</Title>
      {error ? <ErrorBox message={error} /> : null}
      {uri ? <Image source={{ uri }} style={{ width: "100%", height: 180, borderRadius: radius, marginBottom: s.md }} resizeMode="cover" /> : null}

      {phase === "pick" ? (
        <View>
          <Button label="Camera" onPress={() => pick(true)} />
          <Gap />
          <Button label="Photo library" variant="secondary" onPress={() => pick(false)} />
        </View>
      ) : null}

      {phase === "reading" || phase === "pricing" ? <Loading label={t("loading")} /> : null}

      {phase === "confirm" ? (
        <View>
          <Text style={[type.h2, { marginBottom: s.sm }]}>{t("confirmHoldings")}</Text>
          <Card>
            {drafts.map((d) => (
              <View key={d.symbol} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Row left={d.symbol} sub={`${d.quantity.toLocaleString()}${d.avg_cost ? ` @ ${d.avg_cost}` : ""}`} />
                </View>
                <Button
                  label={keep[d.symbol] ? "✓" : "✕"}
                  variant={keep[d.symbol] ? "secondary" : "ghost"}
                  onPress={() => setKeep((k) => ({ ...k, [d.symbol]: !k[d.symbol] }))}
                />
              </View>
            ))}
          </Card>
          {rejected.length ? (
            <Banner tone="warn" title={t("rejectedRows")}>
              {rejected.map((r) => (
                <Text key={r.index} style={type.small}>
                  #{r.index + 1}: {r.reason}
                </Text>
              ))}
            </Banner>
          ) : null}
          <Button label={t("confirm")} onPress={confirm} disabled={!Object.values(keep).some(Boolean)} />
        </View>
      ) : null}
    </Screen>
  );
}
