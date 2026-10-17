import { useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import * as api from "../../src/api/endpoints";
import type { PendingAction } from "../../src/api/types";
import { assistantPrefix, LANGS } from "../../src/lib/i18n";
import { useApp } from "../../src/state/app";
import { errorText } from "../../src/state/useAsync";
import { Button, Pill } from "../../src/ui/components";
import { c, radius, s, type } from "../../src/ui/theme";

interface Turn {
  id: string;
  from: "me" | "assistant";
  text: string;
  tools?: string[];
  grounded?: boolean;
  pending?: PendingAction[];
  failed?: boolean;
}

let seq = 0;
const nextId = () => `t${seq++}`;

export default function Ask() {
  const { t, lang } = useApp();
  const params = useLocalSearchParams<{ prefill?: string }>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (params.prefill) setInput(params.prefill);
  }, [params.prefill]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setTurns((p) => [...p, { id: nextId(), from: "me", text }]);
    setBusy(true);
    try {
      const r = await api.ask(assistantPrefix(lang) + text);
      setTurns((p) => [
        ...p,
        {
          id: nextId(),
          from: "assistant",
          text: r.answer,
          tools: r.agent_execution?.tools_used ?? [],
          grounded: r.responsible_ai?.grounding?.grounded,
          pending: r.pending_actions ?? [],
        },
      ]);
    } catch (e) {
      // Never an invented answer: say it is unavailable and why.
      setTurns((p) => [...p, { id: nextId(), from: "assistant", text: `${t("assistantDown")} ${errorText(e)}`, failed: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const speak = (text: string) => {
    Speech.stop();
    Speech.speak(text, { language: LANGS.find((l) => l.code === lang)?.speech });
  };

  const act = async (turnId: string, action: PendingAction, confirm: boolean) => {
    try {
      const updated = confirm ? await api.confirmAction(action.Id) : await api.rollbackAction(action.Id);
      setTurns((p) =>
        p.map((x) => (x.id === turnId ? { ...x, pending: x.pending?.map((a) => (a.Id === action.Id ? updated : a)) } : x)),
      );
    } catch (e) {
      setTurns((p) => [...p, { id: nextId(), from: "assistant", text: errorText(e), failed: true }]);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ padding: s.lg, paddingBottom: 0 }}>
          <Text style={type.title}>{t("askTitle")}</Text>
          <Text style={type.small}>{t("askHint")}</Text>
        </View>
        <ScrollView ref={scroller} contentContainerStyle={{ padding: s.lg }}>
          {turns.map((m) => (
            <View
              key={m.id}
              style={{
                alignSelf: m.from === "me" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                backgroundColor: m.from === "me" ? c.brand : m.failed ? c.dangerBg : c.card,
                borderRadius: radius,
                padding: s.md,
                marginBottom: s.md,
                borderWidth: m.from === "me" ? 0 : 1,
                borderColor: c.line,
              }}
            >
              <Text style={[type.body, { color: m.from === "me" ? "#fff" : c.text }]}>{m.text}</Text>
              {m.from === "assistant" && !m.failed ? (
                <View style={{ marginTop: s.sm }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {m.grounded ? <Pill text={t("grounded")} tone="ok" /> : null}
                    {m.tools?.map((tool) => <Pill key={tool} text={`${t("toolsUsed")}: ${tool}`} />)}
                  </View>
                  <Button label={t("readAloud")} variant="ghost" onPress={() => speak(m.text)} />
                  {m.pending?.map((a) => (
                    <View key={a.Id} style={{ backgroundColor: c.warnBg, borderRadius: radius, padding: s.md, marginTop: s.sm }}>
                      <Text style={type.body}>{a.Summary}</Text>
                      {a.To ? <Text style={type.small}>→ {a.To}</Text> : null}
                      {a.Status === "pending" ? (
                        <View style={{ flexDirection: "row", gap: s.sm, marginTop: s.sm }}>
                          <View style={{ flex: 1 }}>
                            <Button label={t("confirm")} onPress={() => act(m.id, a, true)} />
                          </View>
                          {/* Rollback on a PENDING action cancels it; nothing has been sent yet. */}
                          <View style={{ flex: 1 }}>
                            <Button label={t("undo")} variant="secondary" onPress={() => act(m.id, a, false)} />
                          </View>
                        </View>
                      ) : (
                        <Pill text={a.Status} tone={a.Status === "confirmed" ? "ok" : "info"} />
                      )}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          {busy ? <Text style={type.small}>{t("loading")}</Text> : null}
        </ScrollView>
        <View style={{ flexDirection: "row", padding: s.md, gap: s.sm, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("askPlaceholder")}
            placeholderTextColor={c.muted}
            multiline
            style={{ flex: 1, fontSize: 17, minHeight: 48, maxHeight: 140, paddingHorizontal: s.md, paddingTop: s.md, borderRadius: radius, borderWidth: 1.5, borderColor: c.line, color: c.text }}
          />
          <View style={{ justifyContent: "flex-end" }}>
            <Button label={t("askSend")} onPress={send} busy={busy} disabled={!input.trim()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
