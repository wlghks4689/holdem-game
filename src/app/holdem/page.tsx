import { Suspense } from "react";
import HoldemClientGate from "./HoldemClientGate";

export default function HoldemPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-900 text-zinc-400">
          불러오는 중…
        </div>
      }
    >
      <HoldemClientGate />
    </Suspense>
  );
}
