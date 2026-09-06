import type { Metadata } from "next";
import { HoldemHomeOrLegacy } from "./holdem/components/HoldemHomeOrLegacy";

export const metadata: Metadata = {
  alternates: { canonical: "/holdem" },
};

export default function Home() {
  return <HoldemHomeOrLegacy />;
}
