// Pure formatting. Rupees by default: the app is for Sri Lankan retail investors.

export function money(value: number | null | undefined, currency = "LKR"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const symbol = currency === "LKR" ? "Rs" : currency;
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : 2;
  const body = abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value < 0 ? "-" : ""}${symbol} ${body}`;
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** Parse what a person types: "300,000", "Rs 300000", "3 lakh" are all 300000. */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/rs\.?|lkr|,|\s+/g, (m) => (m.trim() === "" ? " " : ""));
  const lakh = /^([\d.]+)\s*(lakh|lakhs|lac)$/.exec(s.trim());
  if (lakh) return Number(lakh[1]) * 100_000;
  const n = Number(s.replace(/\s+/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function holdingsValue(holdings: { quantity: number; current_price: number }[]): number {
  return holdings.reduce((sum, h) => sum + h.quantity * h.current_price, 0);
}
