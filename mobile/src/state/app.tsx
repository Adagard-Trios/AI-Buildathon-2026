import { router } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { loadSession, setOnAuthLost, setToken } from "../api/client";
import * as api from "../api/endpoints";
import type { User } from "../api/types";
import { translate, type Key, type Lang } from "../lib/i18n";
import { store } from "./store";

interface AppState {
  ready: boolean;
  user: User | null;
  lang: Lang;
  t: (key: Key) => string;
  setLang: (l: Lang) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, name: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLangState] = useState<Lang>("en");

  const signOut = useCallback(async () => {
    await setToken(null);
    setUser(null);
    router.replace("/welcome");
  }, []);

  useEffect(() => {
    (async () => {
      setLangState(await store.lang());
      const token = await loadSession();
      if (token) {
        try {
          setUser(await api.me());
        } catch {
          await setToken(null); // expired or revoked: start clean at sign-in
        }
      }
      setReady(true);
    })();
  }, []);

  // A 401 anywhere means the session is over; go back to sign-in once, not per request.
  useEffect(() => {
    setOnAuthLost(() => void signOut());
    return () => setOnAuthLost(null);
  }, [signOut]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      user,
      lang,
      t: (key) => translate(lang, key),
      setLang: (l) => {
        setLangState(l);
        void store.setLang(l);
      },
      signIn: async (email, password) => {
        setUser((await api.login(email.trim(), password)).user);
      },
      signUp: async (email, name, password) => {
        setUser((await api.register(email.trim(), name.trim(), password)).user);
      },
      signOut,
    }),
    [ready, user, lang, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

/** The signed-in user; screens under (tabs) are only reachable with one. */
export function useUser(): User {
  const { user } = useApp();
  if (!user) throw new Error("No signed-in user");
  return user;
}
