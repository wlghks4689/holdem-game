import type { Metadata } from "next";
import { HoldemHomeOrLegacy } from "./components/HoldemHomeOrLegacy";

export const metadata: Metadata = {
  alternates: { canonical: "/holdem" },
};

export default function HoldemPage() {
  return <HoldemHomeOrLegacy />;
}
