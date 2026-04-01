import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        // itch.io는 ZIP 내부의 상대경로로 애셋을 찾으므로
        // /_next/... 절대경로 대신 ./_next/... 상대경로를 사용해야 함
        assetPrefix: "./",
      }
    : {}),
};

export default nextConfig;
