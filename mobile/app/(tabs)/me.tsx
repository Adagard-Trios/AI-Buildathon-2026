import { router } from "expo-router";
import { Text } from "react-native";

import { LANGS } from "../../src/lib/i18n";
import { useApp, useUser } from "../../src/state/app";
import { Button, Card, Gap, Screen, Segmented, Title } from "../../src/ui/components";
import { s, type } from "../../src/ui/theme";

export default function Me() {
  const { t, lang, setLang, signOut } = useApp();
  const user = useUser();
  return (
    <Screen>
      <Title sub={user.email}>{user.display_name}</Title>

      <Card>
        <Text style={[type.h2, { marginBottom: s.md }]}>{t("language")}</Text>
        <Segmented options={LANGS.map((l) => ({ value: l.code, label: l.label }))} value={lang} onChange={setLang} />
      </Card>

      <Card>
        <Text style={type.h2}>{t("guardianTitle")}</Text>
        <Text style={[type.small, { marginVertical: s.sm }]}>{t("guardianBody")}</Text>
        <Button label={t("guardianTitle")} variant="secondary" onPress={() => router.push("/guardian")} />
      </Card>

      <Card>
        <Text style={type.h2}>{t("receipts")}</Text>
        <Text style={[type.small, { marginVertical: s.sm }]}>{t("receiptsBody")}</Text>
        <Button label={t("receipts")} variant="secondary" onPress={() => router.push("/receipts")} />
      </Card>

      <Button label={t("servers")} variant="ghost" onPress={() => router.push("/servers")} />
      <Gap />
      <Button label={t("signOut")} variant="danger" onPress={signOut} />
    </Screen>
  );
}
