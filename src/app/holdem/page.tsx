import { Suspense } from "react";
import { HoldemHomeOrLegacy } from "./components/HoldemHomeOrLegacy";

export default function HoldemPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-900 text-zinc-400">
          불러오는 중…
        </div>
      }
    >
      <HoldemHomeOrLegacy />
    </Suspense>
  );
}
