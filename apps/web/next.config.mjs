import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n.ts");

// phase 6E-5: bundle analyzer — `ANALYZE=true npm run build` 開分析
let withAnalyzer = (cfg) => cfg;
if (process.env.ANALYZE === "true") {
  // 動態 import 避免 prod build 把 analyzer 也打進去
  const { default: bundleAnalyzer } = await import("@next/bundle-analyzer");
  withAnalyzer = bundleAnalyzer({ enabled: true });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output bundles only the files needed to run the app — much
  // smaller prod image (no node_modules, no source). Required by the prod
  // Docker stage in apps/web/Dockerfile.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default withAnalyzer(withNextIntl(nextConfig));
