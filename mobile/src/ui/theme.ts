// Calm, high-contrast, large type: the customer is often an older first-time investor.

export const c = {
  bg: "#F6F7F9",
  card: "#FFFFFF",
  text: "#111418",
  muted: "#5B6470",
  line: "#E3E6EA",
  brand: "#1F5EFF",
  brandText: "#FFFFFF",
  danger: "#C62828",
  dangerBg: "#FDECEC",
  warn: "#9A5B00",
  warnBg: "#FFF4E0",
  ok: "#1E7B3A",
  okBg: "#E7F6EC",
  info: "#1F5EFF",
  infoBg: "#EAF0FF",
};

export const s = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const type = {
  title: { fontSize: 26, fontWeight: "700" as const, color: c.text },
  h2: { fontSize: 20, fontWeight: "700" as const, color: c.text },
  body: { fontSize: 17, color: c.text, lineHeight: 24 },
  small: { fontSize: 14, color: c.muted, lineHeight: 20 },
  big: { fontSize: 32, fontWeight: "800" as const, color: c.text },
};

export const radius = 14;
