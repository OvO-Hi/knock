import type { NextConfig } from "next";

// 런타임에 data/*.csv·json·geojson 을 읽는 API 라우트 (Vercel 배포 시 함수 번들에 포함)
const DATA_ROUTES = ["chat", "brief", "prioritize", "dongs", "geo", "rules", "resources"];

const nextConfig: NextConfig = {
  // 로컬에서 dev 서버와 별도로 프로덕션 빌드를 검증할 때 NEXT_DIST_DIR=.next-build 로 출력 폴더를 분리
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingIncludes: Object.fromEntries(DATA_ROUTES.map((r) => [`/api/${r}`, ["./data/**/*"]])),
};

export default nextConfig;
