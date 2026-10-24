import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 런타임에 data/*.csv 를 읽는 API 라우트용 (Vercel 배포 시 함수 번들에 포함)
  outputFileTracingIncludes: {
    "/api/**": ["./data/**"],
  },
};

export default nextConfig;
