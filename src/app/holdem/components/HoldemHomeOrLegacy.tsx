"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PlayerIndex } from "@/holdem/types";
import { saveRoomAuth } from "@/holdem/roomCredentials";
import { HoldemHomeHub } from "./HoldemHomeHub";

const ROOM_ID_RE = /^[a-f0-9]{8}$/;

export function HoldemHomeOrLegacy() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = React.useState<"pending" | "legacy" | "home">(
    "pending",
  );

  React.useEffect(() => {
    const room = searchParams.get("room")?.toLowerCase() ?? "";
    const seatRaw = searchParams.get("seat");
    const token = searchParams.get("token") ?? "";

    if (
      ROOM_ID_RE.test(room) &&
      (seatRaw === "0" || seatRaw === "1") &&
      token.length >= 16
    ) {
      const mySeat = Number(seatRaw) as PlayerIndex;
      saveRoomAuth(room, { seat: mySeat, token });
      setMode("legacy");
      router.replace(`/holdem/room/${room}`);
      return;
    }

    setMode("home");
  }, [searchParams, router]);

  if (mode === "pending" || mode === "legacy") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-900 text-zinc-400">
        이동 중…
      </div>
    );
  }

  return <HoldemHomeHub />;
}
