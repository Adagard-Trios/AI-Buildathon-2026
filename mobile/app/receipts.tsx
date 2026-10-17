import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import * as api from "../src/api/endpoints";
import type { VerifyResult } from "../src/api/types";
import { useApp, useUser } from "../src/state/app";
import { store } from "../src/state/store";
import { errorText, useAsync } from "../src/state/useAsync";
import { Button, Card, Loading, Pill, Screen, Title } from "../src/ui/components";
import { c, s, type } from "../src/ui/theme";

type Check = { state: "busy" } | { state: "done"; result: VerifyResult } | { state: "error"; message: string };

export default function Receipts() {
  const { t } = useApp();
  const user = useUser();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { data, loading } = useAsync(() => store.receipts(user.id), user.id);
  const [checks, setChecks] = useState<Record<string, Check>>({});

  // Component 3 recomputes the record's hash and compares it with the anchored one.
  const verify = async (id: string) => {
    setChecks((m) => ({ ...m, [id]: { state: "busy" } }));
    try {
      const result = await api.verifyDecision(id);
      setChecks((m) => ({ ...m, [id]: { state: "done", result } }));
    } catch (e) {
      setChecks((m) => ({ ...m, [id]: { state: "error", message: errorText(e) } }));
    }
  };

  if (loading) return <Loading label={t("loading")} />;
  return (
    <Screen>
      <Title sub={t("receiptsBody")}>{t("receipts")}</Title>
      {!data?.length ? <Text style={type.body}>{t("nothingYet")}</Text> : null}
      {data?.map((r) => {
        const ck = checks[r.id];
        return (
          <Card key={r.id} style={r.id === focus ? { borderColor: c.brand, borderWidth: 2 } : undefined}>
            <Text style={type.small}>{new Date(r.at).toLocaleString()}</Text>
            <Text style={[type.body, { marginVertical: s.xs }]}>{r.label}</Text>
            <Text style={[type.small, { color: c.muted }]} selectable>
              {r.id}
            </Text>
            <View style={{ marginTop: s.sm }}>
              {r.verifiable ? (
                ck?.state === "done" ? (
                  <View>
                    <Pill text={ck.result.verified ? t("verified") : t("notVerified")} tone={ck.result.verified ? "ok" : "danger"} />
                    <Text style={type.small}>{ck.result.message}</Text>
                  </View>
                ) : ck?.state === "error" ? (
                  <View>
                    <Pill text={t("notVerified")} tone="warn" />
                    <Text style={type.small}>{ck.message}</Text>
                    <Button label={t("retry")} variant="ghost" onPress={() => verify(r.id)} />
                  </View>
                ) : (
                  <Button label={t("checkProof")} variant="secondary" busy={ck?.state === "busy"} onPress={() => verify(r.id)} />
                )
              ) : (
                <Pill text="Recorded by FirstStep" />
              )}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
