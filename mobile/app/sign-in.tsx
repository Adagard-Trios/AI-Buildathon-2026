import { router } from "expo-router";
import { useState } from "react";

import { useApp } from "../src/state/app";
import { errorText } from "../src/state/useAsync";
import { Button, ErrorBox, Field, Gap, Screen } from "../src/ui/components";

export default function SignIn() {
  const { t, signIn } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace("/(tabs)");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {error ? <ErrorBox message={error} /> : null}
      <Field label={t("email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
      <Field label={t("password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
      <Gap />
      <Button label={t("signIn")} onPress={submit} busy={busy} disabled={!email || !password} />
      <Gap />
      <Button label={t("noAccount")} variant="ghost" onPress={() => router.replace("/sign-up")} />
    </Screen>
  );
}
