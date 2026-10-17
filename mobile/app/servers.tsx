import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { baseUrls, setUrlOverrides, urlOverrides } from "../src/api/client";
import { SERVICES, type Service } from "../src/lib/urls";
import { useApp } from "../src/state/app";
import { Button, Field, Gap, Screen, Title } from "../src/ui/components";
import { type } from "../src/ui/theme";

// Point the app at a deployed stack (Cloud Run URLs) or a laptop on the same Wi-Fi.
export default function Servers() {
  const { t } = useApp();
  const current = baseUrls();
  const [values, setValues] = useState<Partial<Record<Service, string>>>(urlOverrides());

  const save = async () => {
    await setUrlOverrides(Object.fromEntries(Object.entries(values).filter(([, v]) => v?.trim())));
    router.back();
  };

  return (
    <Screen>
      <Title sub={t("serversHint")}>{t("servers")}</Title>
      {SERVICES.map((svc) => (
        <Field
          key={svc}
          label={svc}
          value={values[svc] ?? ""}
          placeholder={current[svc]}
          onChangeText={(v) => setValues((m) => ({ ...m, [svc]: v }))}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      ))}
      <Text style={type.small}>Changing the platform address signs you out on the next request if the token is not valid there.</Text>
      <Gap />
      <Button label={t("save")} onPress={save} />
    </Screen>
  );
}
