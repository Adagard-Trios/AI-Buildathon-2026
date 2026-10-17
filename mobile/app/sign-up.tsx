import { router } from "expo-router";
import { useState } from "react";

import { useApp } from "../src/state/app";
import { errorText } from "../src/state/useAsync";
import { Button, ErrorBox, Field, Gap, Screen } from "../src/ui/components";

export default function SignUp() {
  const { t, signUp } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp(email, name, password);
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
      <Field label={t("name")} value={name} onChangeText={setName} autoComplete="name" />
      <Field label={t("email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t("password")} hint={t("passwordHint")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Gap />
      <Button label={t("signUp")} onPress={submit} busy={busy} disabled={!name || !email || password.length < 8} />
      <Gap />
      <Button label={t("haveAccount")} variant="ghost" onPress={() => router.replace("/sign-in")} />
    </Screen>
  );
}
