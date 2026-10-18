"use client";

/**
 * Shared shell for every component's screens.
 *
 * The navigation is the contract with the rest of the team: each of the four components owns
 * a top-level section, and adding one means adding a NAV entry plus a folder. Nothing else
 * in this file changes.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Spinner } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth/context";

interface NavItem {
  href: string;
  label: string;
  component: string;
  ready: boolean;
}

const NAV: NavItem[] = [
  // Component 1 — this work.
  { href: "/portfolio", label: "Portfolio", component: "1", ready: true },
  { href: "/withdraw", label: "Withdraw", component: "1", ready: true },
  { href: "/optimize", label: "Optimize", component: "1", ready: true },
  { href: "/forecast", label: "Forecast", component: "1", ready: true },
  { href: "/analysis", label: "Analysis", component: "1", ready: true },
  // Teammates' components, now wired to their real services. `ready` still exists because a
  // service being LIVE and a service being UP are different things -- each page handles the
  // second case itself, via ApiError.isUnavailable.
  { href: "/fraud", label: "Fraud", component: "2", ready: true },
  { href: "/audit", label: "Audit", component: "3", ready: true },
  { href: "/assistant", label: "Assistant", component: "4", ready: true },
];

// Grouped by what people come to do, not by which team built it.
const GROUPS = [
  { label: "Money", items: NAV.filter((n) => n.component === "1") },
  { label: "Safety", items: NAV.filter((n) => n.component !== "1") },
];

function Shell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Wait for `loading` before redirecting, or a signed-in user is bounced to /login on
    // every hard refresh while the token is still being verified.
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner label="Restoring session" />
      </main>
    );
  }

  if (!user) return null; // redirect in flight

  const initials = user.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const role = user.roles?.length ? user.roles.join(" · ") : "customer";

  return (
    <div className="min-h-dvh bg-sunken">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 sm:px-6">
          <Link href="/portfolio" className="flex items-center gap-2.5" aria-label="FirstStep home">
            <BrandMark />
            <span className="text-[17px] font-semibold tracking-tight">FirstStep</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right leading-tight sm:block">
              <p className="font-medium">{user.display_name}</p>
              {/* Display only: each service enforces roles from the signed token. */}
              <p className="text-xs text-muted">{role}</p>
            </div>
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent-tint text-xs font-semibold text-accent">
              {initials || "?"}
            </span>
            <button
              onClick={logout}
              className="min-h-9 rounded-lg px-2.5 text-sm font-medium text-muted hover:bg-sunken hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>

        <nav aria-label="Sections" className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 text-sm sm:px-6">
          {GROUPS.map((group, gi) => (
            <div key={group.label} className="flex shrink-0 items-center gap-1">
              {gi > 0 && <span aria-hidden className="mx-2 h-5 w-px bg-line" />}
              <span className="mr-1 hidden text-xs font-medium uppercase tracking-wider text-muted lg:inline">
                {group.label}
              </span>
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-9 shrink-0 items-center rounded-lg px-3 font-medium transition ${
                      active ? "bg-accent-tint text-accent" : "text-ink/80 hover:bg-sunken hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

/** A step: two offset blocks. The name is the product's promise (the first step is to stop
 *  and check), so the mark is drawn from it rather than from a generic finance symbol. */
function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
      <rect x="2" y="12" width="10" height="10" rx="2.5" className="fill-accent" />
      <rect x="12" y="2" width="10" height="10" rx="2.5" className="fill-accent" opacity="0.55" />
    </svg>
  );
}

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
