import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        // itch.io는 업로드마다 iframe 하위 경로가 달라 고정 basePath를 쓸 수 없습니다.
        // ZIP 루트를 가리키는 <base>와 함께 Next/RSC 자산을 상대경로로 생성합니다.
        assetPrefix: "./",
      }
    : {}),
};

export default nextConfig;
