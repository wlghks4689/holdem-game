import { HoldemRoomClient } from "../../HoldemRoomClient";

type PageProps = { params: Promise<{ roomId: string }> };

// Static export: no room pages are pre-generated (multiplayer is server-only)
export function generateStaticParams() {
  return [];
}

export default async function HoldemRoomPage({ params }: PageProps) {
  const { roomId } = await params;
  return <HoldemRoomClient roomId={roomId} />;
}
