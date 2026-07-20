import HoldemPageClient from "../HoldemPageClient";
import { BackHomeLink } from "../components/BackHomeLink";

export default function HoldemPracticePage() {
  return (
    <div className="min-h-dvh bg-zinc-900">
      <div className="mx-auto max-w-3xl px-4 pb-2 pt-4 lg:max-w-6xl lg:px-8 lg:pt-6">
        <BackHomeLink />
      </div>
      <HoldemPageClient />
    </div>
  );
}
