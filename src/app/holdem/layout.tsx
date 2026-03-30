import type { ReactNode } from "react";
import { HoldemLocaleProvider } from "@/holdem/i18n/HoldemLocaleProvider";
import { HoldemMotionRuntime } from "./HoldemMotionRuntime";

export default function HoldemLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <HoldemLocaleProvider>
      <HoldemMotionRuntime>{children}</HoldemMotionRuntime>
    </HoldemLocaleProvider>
  );
}
