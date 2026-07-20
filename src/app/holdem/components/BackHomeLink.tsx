"use client";

import Link from "next/link";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";

export function BackHomeLink() {
  const { locale } = useHoldemI18n();
  return (
    <Link
      href="/holdem"
      className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
    >
      {locale === "en" ? "← Home" : "← 홈으로"}
    </Link>
  );
}
