import type { ReactNode } from "react";
import { HoldemLocaleProvider } from "@/holdem/i18n/HoldemLocaleProvider";

export default function HoldemLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <HoldemLocaleProvider>{children}</HoldemLocaleProvider>;
}
