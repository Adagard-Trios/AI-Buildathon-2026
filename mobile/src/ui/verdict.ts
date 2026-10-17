import type { ShieldLevel } from "../api/types";
import type { Key } from "../lib/i18n";

export function levelLabel(t: (k: Key) => string, level: ShieldLevel): string {
  return level === "HIGH_RISK" ? t("levelHigh") : level === "CAUTION" ? t("levelCaution") : t("levelLow");
}

export function levelAdvice(t: (k: Key) => string, level: ShieldLevel): string {
  return level === "HIGH_RISK" ? t("adviceHigh") : level === "CAUTION" ? t("adviceCaution") : t("adviceLow");
}

export function levelTone(level: ShieldLevel): "danger" | "warn" | "ok" {
  return level === "HIGH_RISK" ? "danger" : level === "CAUTION" ? "warn" : "ok";
}
