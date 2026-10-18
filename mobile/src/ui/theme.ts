// Calm, high-contrast, large type: the customer is often an older first-time investor.

// The same passbook palette as the web app, so FirstStep looks like one product on both.
// Every text colour clears 4.5:1 on bg and card (measured: text 15.3, muted 5.8, brand 5.7,
// danger 6.0, warn 5.8 on bg; tinted pairs 5.5+).
export const c = {
  bg: "#F3F5F4",
  card: "#FFFFFF",
  text: "#14201F",
  muted: "#55625F",
  line: "#DDE3E1",
  brand: "#0B6E4F",
  brandText: "#FFFFFF",
  danger: "#B42318",
  dangerBg: "#FDECEA",
  warn: "#8A5300",
  warnBg: "#FDF3E1",
  ok: "#0B6E4F",
  okBg: "#E7F4EE",
  info: "#14201F",
  infoBg: "#E9EEEC",
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
