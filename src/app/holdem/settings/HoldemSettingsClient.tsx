"use client";

import * as React from "react";
import Link from "next/link";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type { HoldemUiLocale } from "@/holdem/holdemPrefs";
import {
  loadMadeHandFxEnabled,
  loadRoomNickname,
  loadHoldemUiLocale,
  saveMadeHandFxEnabled,
  saveRoomNickname,
} from "@/holdem/holdemPrefs";

export function HoldemSettingsClient() {
  const { t, locale, setLocale } = useHoldemI18n();
  const [nickname, setNickname] = React.useState("");
  const [madeFx, setMadeFx] = React.useState(true);
  const [localeChoice, setLocaleChoice] =
    React.useState<HoldemUiLocale>("ko");
  const [soundOn, setSoundOn] = React.useState(false);

  React.useEffect(() => {
    setNickname(loadRoomNickname());
    setMadeFx(loadMadeHandFxEnabled());
    setLocaleChoice(loadHoldemUiLocale());
  }, []);

  React.useEffect(() => {
    setLocaleChoice(locale);
  }, [locale]);

  React.useEffect(() => {
    try {
      const s = window.localStorage.getItem("holdem-sound-enabled-v1");
      setSoundOn(s === "1");
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        "holdem-sound-enabled-v1",
        soundOn ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-lg px-4 py-10 pb-16 lg:max-w-xl lg:py-14">
        <Link
          href="/holdem"
          className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
        >
          {t("settings.backHome")}
        </Link>
        <h1 className="mt-6 text-2xl font-bold">{t("settings.title")}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t("settings.intro")}</p>

        <div className="mt-8 space-y-4 rounded-2xl border border-zinc-700/80 bg-zinc-800/40 p-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-zinc-400">
              {t("settings.nicknameLabel")}
            </span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 24))}
              onBlur={() => saveRoomNickname(nickname)}
              maxLength={24}
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-zinc-50"
              placeholder={t("common.player")}
            />
            <span className="text-[11px] leading-snug text-zinc-500">
              {t("settings.nicknameHint")}
            </span>
          </label>

          <div className="border-t border-zinc-700/60 pt-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={madeFx}
                onChange={(e) => {
                  const v = e.target.checked;
                  setMadeFx(v);
                  saveMadeHandFxEnabled(v);
                }}
                className="h-4 w-4 rounded border-zinc-500"
              />
              <span className="flex flex-col gap-0.5">
                <span>{t("settings.madeHandFx")}</span>
                <span className="text-[11px] font-normal text-zinc-500">
                  {t("settings.madeHandFxHint")}
                </span>
              </span>
            </label>
          </div>

          <div className="border-t border-zinc-700/60 pt-4">
            <span className="text-xs font-medium text-zinc-400">
              {t("settings.language")}
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["ko", "settings.languageKo"],
                  ["en", "settings.languageEn"],
                ] as const
              ).map(([code, labelKey]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setLocaleChoice(code);
                    setLocale(code);
                  }}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    localeChoice === code
                      ? "border-sky-500 bg-sky-600/25 text-sky-100"
                      : "border-zinc-600 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800",
                  ].join(" ")}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-zinc-500">
              {t("settings.languageNote")}
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-3 border-t border-zinc-700/60 pt-4 text-sm">
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-500"
            />
            <span>
              {t("settings.sound")}
              <span className="ml-2 text-xs text-zinc-500">
                {t("settings.soundHint")}
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
