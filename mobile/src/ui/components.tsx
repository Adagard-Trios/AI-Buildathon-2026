import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { c, radius, s, type } from "./theme";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <View style={{ marginBottom: s.lg }}>
      <Text style={type.title} accessibilityRole="header">
        {children}
      </Text>
      {sub ? <Text style={[type.small, { marginTop: s.xs }]}>{sub}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
}) {
  const v = VARIANTS[variant];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: v.bg, borderColor: v.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {busy ? <ActivityIndicator color={v.fg} /> : <Text style={[styles.buttonText, { color: v.fg }]}>{label}</Text>}
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: c.brand, fg: c.brandText, border: c.brand },
  secondary: { bg: c.card, fg: c.brand, border: c.brand },
  danger: { bg: c.danger, fg: "#fff", border: c.danger },
  ghost: { bg: "transparent", fg: c.brand, border: "transparent" },
};

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: s.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={c.muted} style={[styles.input, props.multiline && styles.multiline]} {...props} />
      {hint ? <Text style={[type.small, { marginTop: s.xs }]}>{hint}</Text> : null}
    </View>
  );
}

type Tone = "danger" | "warn" | "ok" | "info";
const TONES: Record<Tone, { bg: string; fg: string }> = {
  danger: { bg: c.dangerBg, fg: c.danger },
  warn: { bg: c.warnBg, fg: c.warn },
  ok: { bg: c.okBg, fg: c.ok },
  info: { bg: c.infoBg, fg: c.info },
};

export function Banner({ tone, title, children }: { tone: Tone; title: string; children?: ReactNode }) {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg, borderLeftColor: t.fg }]} accessibilityRole="alert">
      <Text style={[type.h2, { color: t.fg }]}>{title}</Text>
      {children ? <View style={{ marginTop: s.sm }}>{children}</View> : null}
    </View>
  );
}

export function Pill({ text, tone = "info" }: { text: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.fg, fontSize: 13, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

export function Row({ left, right, sub }: { left: string; right?: string; sub?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: s.md }}>
        <Text style={type.body}>{left}</Text>
        {sub ? <Text style={type.small}>{sub}</Text> : null}
      </View>
      {right ? <Text style={[type.body, { fontWeight: "600" }]}>{right}</Text> : null}
    </View>
  );
}

export function ErrorBox({ message, onRetry, retryLabel = "Try again" }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <Banner tone="danger" title="Something went wrong">
      <Text style={type.body}>{message}</Text>
      {onRetry ? (
        <View style={{ marginTop: s.md }}>
          <Button label={retryLabel} variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </Banner>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ padding: s.xl, alignItems: "center" }}>
      <ActivityIndicator size="large" color={c.brand} />
      {label ? <Text style={[type.small, { marginTop: s.md }]}>{label}</Text> : null}
    </View>
  );
}

export function Gap({ size = s.md }: { size?: number }) {
  return <View style={{ height: size }} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, on && { backgroundColor: c.brand }]}
          >
            <Text style={{ color: on ? "#fff" : c.text, fontWeight: "600", fontSize: 15 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  content: { padding: s.lg, paddingBottom: s.xxl * 2 },
  card: { backgroundColor: c.card, borderRadius: radius, padding: s.lg, marginBottom: s.md, borderWidth: 1, borderColor: c.line },
  button: { minHeight: 52, borderRadius: radius, alignItems: "center", justifyContent: "center", paddingHorizontal: s.lg, borderWidth: 1.5 },
  buttonText: { fontSize: 17, fontWeight: "700" },
  label: { fontSize: 15, fontWeight: "600", color: c.text, marginBottom: s.xs },
  input: { minHeight: 52, borderWidth: 1.5, borderColor: c.line, borderRadius: radius, paddingHorizontal: s.md, fontSize: 17, color: c.text, backgroundColor: c.card },
  multiline: { minHeight: 140, paddingTop: s.md, textAlignVertical: "top" },
  banner: { borderRadius: radius, padding: s.lg, borderLeftWidth: 6, marginBottom: s.md },
  pill: { alignSelf: "flex-start", paddingHorizontal: s.md, paddingVertical: s.xs, borderRadius: 999, marginRight: s.sm, marginBottom: s.sm },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: s.md, borderBottomWidth: 1, borderBottomColor: c.line },
  segment: { flexDirection: "row", backgroundColor: c.card, borderRadius: radius, borderWidth: 1, borderColor: c.line, padding: 4 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: radius - 4, alignItems: "center", justifyContent: "center" },
});
