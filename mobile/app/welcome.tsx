import { router } from "expo-router";
import { Text, View } from "react-native";

import { LANGS } from "../src/lib/i18n";
import { useApp } from "../src/state/app";
import { Button, Gap, Screen, Segmented } from "../src/ui/components";
import { c, s, type } from "../src/ui/theme";

export default function Welcome() {
  const { t, lang, setLang } = useApp();
  return (
    <Screen>
      <View style={{ paddingTop: s.xxl * 2 }}>
        <Text style={[type.big, { color: c.brand }]}>{t("appName")}</Text>
        <Gap size={s.md} />
        <Text style={type.h2}>{t("tagline")}</Text>
        <Gap size={s.md} />
        <Text style={[type.body, { color: c.muted }]}>{t("welcomeBody")}</Text>
        <Gap size={s.xxl} />
        <Text style={[type.small, { marginBottom: s.sm }]}>{t("language")}</Text>
        <Segmented options={LANGS.map((l) => ({ value: l.code, label: l.label }))} value={lang} onChange={setLang} />
        <Gap size={s.xxl} />
        <Button label={t("signUp")} onPress={() => router.push("/sign-up")} />
        <Gap />
        <Button label={t("signIn")} variant="secondary" onPress={() => router.push("/sign-in")} />
      </View>
    </Screen>
  );
}
