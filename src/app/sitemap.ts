import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only stable public pages; temporary room URLs must not enter the sitemap.
  return [
    { url: "https://holdem-game.vercel.app/holdem" },
    { url: "https://holdem-game.vercel.app/holdem/guide" },
  ];
}
