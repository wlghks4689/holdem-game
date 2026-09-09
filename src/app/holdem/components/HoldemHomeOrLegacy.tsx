"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlayerIndex } from "@/holdem/types";
import { saveRoomAuth } from "@/holdem/roomCredentials";
import { HoldemHomeHub } from "./HoldemHomeHub";

const ROOM_ID_RE = /^[a-f0-9]{8}$/;

export function HoldemHomeOrLegacy() {
  const router = useRouter();

  React.useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
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
      router.replace(`/holdem/room/${room}`);
    }
  }, [router]);

  return <HoldemHomeHub />;
}
