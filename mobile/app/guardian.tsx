import { useState } from "react";
import { Text, View } from "react-native";

import * as api from "../src/api/endpoints";
import type { PendingAction } from "../src/api/types";
import { useApp } from "../src/state/app";
import { errorText, useAsync } from "../src/state/useAsync";
import { Button, Card, ErrorBox, Field, Gap, Loading, Row, Screen, Title } from "../src/ui/components";
import { s, type } from "../src/ui/theme";

export default function GuardianScreen() {
  const { t } = useApp();
  const guardians = useAsync(() => api.guardians());
  const pending = useAsync(() => api.pendingActions());
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.addGuardian(contact.trim(), name.trim());
      setContact("");
      setName("");
      await guardians.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // Nothing is sent to the guardian until the customer confirms it here: the Trust Panel.
  const act = async (a: PendingAction, confirm: boolean) => {
    try {
      if (confirm) await api.confirmAction(a.Id);
      else await api.rollbackAction(a.Id);
      await pending.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Screen>
      <Title sub={t("guardianBody")}>{t("guardianTitle")}</Title>
      {error ? <ErrorBox message={error} /> : null}

      {pending.data?.length ? (
        <Card>
          <Text style={type.h2}>{t("pendingTitle")}</Text>
          {pending.data.map((a) => (
            <View key={a.Id} style={{ marginTop: s.md }}>
              <Text style={type.body}>{a.Summary}</Text>
              {a.To ? <Text style={type.small}>→ {a.To}</Text> : null}
              <View style={{ flexDirection: "row", gap: s.sm, marginTop: s.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label={t("confirm")} onPress={() => act(a, true)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label={t("undo")} variant="secondary" onPress={() => act(a, false)} />
                </View>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        {guardians.loading ? <Loading /> : null}
        {guardians.error ? <Text style={type.small}>{guardians.error}</Text> : null}
        {guardians.data?.map((g) => <Row key={g.Id} left={g.Name || g.Contact} sub={g.Name ? g.Contact : undefined} />)}
        {guardians.data?.length === 0 ? <Text style={type.small}>{t("nothingYet")}</Text> : null}
      </Card>

      <Field label={t("guardianName")} value={name} onChangeText={setName} />
      <Field label={t("guardianContact")} value={contact} onChangeText={setContact} autoCapitalize="none" keyboardType="email-address" />
      <Gap size={s.sm} />
      <Button label={t("addGuardian")} onPress={add} busy={busy} disabled={contact.trim().length < 3} />
    </Screen>
  );
}
