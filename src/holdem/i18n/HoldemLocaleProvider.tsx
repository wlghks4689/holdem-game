"use client";

import * as React from "react";
import type { HoldemUiLocale } from "../holdemPrefs";
import { loadHoldemUiLocale, saveHoldemUiLocale } from "../holdemPrefs";
import type { MessageKey } from "./messages";
import { message } from "./messages";

type Ctx = {
  locale: HoldemUiLocale;
  setLocale: (l: HoldemUiLocale) => void;
  t: (key: MessageKey) => string;
};

const HoldemLocaleContext = React.createContext<Ctx | null>(null);

export function HoldemLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = React.useState<HoldemUiLocale>("ko");

  React.useEffect(() => {
    setLocaleState(loadHoldemUiLocale());
    const onLocale = () => setLocaleState(loadHoldemUiLocale());
    window.addEventListener("holdem-locale-changed", onLocale);
    return () => window.removeEventListener("holdem-locale-changed", onLocale);
  }, []);

  const setLocale = React.useCallback((l: HoldemUiLocale) => {
    saveHoldemUiLocale(l);
    setLocaleState(l);
  }, []);

  const t = React.useCallback(
    (key: MessageKey) => message(locale, key),
    [locale],
  );

  const v = React.useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <HoldemLocaleContext.Provider value={v}>
      {children}
    </HoldemLocaleContext.Provider>
  );
}

export function useHoldemI18n(): Ctx {
  const c = React.useContext(HoldemLocaleContext);
  if (!c) {
    return {
      locale: "ko",
      setLocale: saveHoldemUiLocale,
      t: (key: MessageKey) => message("ko", key),
    };
  }
  return c;
}
