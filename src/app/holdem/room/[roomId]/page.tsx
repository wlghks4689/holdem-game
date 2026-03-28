import { HoldemRoomClient } from "../../HoldemRoomClient";

type PageProps = { params: Promise<{ roomId: string }> };

export default async function HoldemRoomPage({ params }: PageProps) {
  const { roomId } = await params;
  return <HoldemRoomClient roomId={roomId} />;
}
