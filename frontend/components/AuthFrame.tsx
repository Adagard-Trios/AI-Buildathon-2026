import type { ReactNode } from "react";

/**
 * Sign-in and registration share one frame: what FirstStep is for on the left, the form on
 * the right. Stacked on narrow screens with the form first, because that is the job.
 */
const PROMISES = [
  ["Check a message", "Paste a WhatsApp or SMS offer and get a verdict before you pay anyone."],
  ["Raise cash calmly", "Plan which shares to sell so a withdrawal costs as little as possible."],
  ["Every decision on record", "Each verdict is sealed, so nobody can quietly change it later."],
] as const;

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-sunken">
      <div className="mx-auto grid min-h-dvh max-w-5xl items-center gap-10 p-6 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <section className="order-2 md:order-1">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" className="size-8" aria-hidden>
              <rect x="2" y="12" width="10" height="10" rx="2.5" className="fill-accent" />
              <rect x="12" y="2" width="10" height="10" rx="2.5" className="fill-accent" opacity="0.55" />
            </svg>
            <span className="text-xl font-semibold tracking-tight">FirstStep</span>
          </div>
          <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Stop the scam before the money moves.
          </h1>
          <ul className="mt-8 space-y-5">
            {PROMISES.map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden className="mt-1 size-2 shrink-0 rounded-full bg-accent" />
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="order-1 md:order-2">{children}</section>
      </div>
    </main>
  );
}
