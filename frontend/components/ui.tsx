"use client";

/**
 * Small shared primitives.
 *
 * Deliberately hand-rolled rather than pulling in a component library: the project has no
 * design system, and four components' worth of UI is easier to keep consistent against a
 * handful of readable primitives than against someone else's API.
 *
 * Tailwind v4 CSS-first — theme tokens live in app/globals.css under @theme inline; there
 * is no tailwind.config.ts.
 */

import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}
    >
      {title && (
        <header className="mb-4">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  // One filled colour on a screen: the primary action. Destructive actions are outlined in
  // red so they never compete with Save for the eye.
  const styles = {
    primary: "bg-accent text-accent-ink hover:brightness-110 active:brightness-95",
    secondary: "border border-line bg-surface hover:bg-sunken",
    danger: "border border-danger/40 text-danger hover:bg-danger-tint",
  }[variant];

  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm transition focus:border-accent ${props.className ?? ""}`}
    />
  );
}

/** Non-blocking message. `tone` carries meaning: an infeasible withdrawal is a real answer,
 *  not an error, so it uses "warn" rather than "error". */
export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  title?: string;
  children?: ReactNode;
}) {
  // Tone is never carried by colour alone: each one has its own glyph.
  const styles = {
    info: "bg-sunken text-ink",
    warn: "bg-caution-tint text-caution",
    error: "bg-danger-tint text-danger",
    success: "bg-accent-tint text-accent",
  }[tone];
  const glyph = { info: "i", warn: "!", error: "×", success: "✓" }[tone];

  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-xl p-3.5 text-sm ${styles}`}>
      <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-current text-[11px] font-bold">
        {glyph}
      </span>
      <div className="min-w-0">
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={`${title ? "mt-1" : ""} text-ink/85`}>{children}</div>}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="figures mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </p>
  );
}

// --- formatting ---------------------------------------------------------------------
// Shared so every screen renders money and percentages identically. Percentages come from
// the API as fractions (0.0021), never pre-multiplied.

export const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

export const percent = (fraction: number, digits = 3) =>
  `${(fraction * 100).toFixed(digits)}%`;

export const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
