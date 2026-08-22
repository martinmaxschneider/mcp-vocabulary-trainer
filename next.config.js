import createNextIntlPlugin from "next-intl/plugin";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/**"],
  },
  outputFileTracingExcludes: {
    "*": ["./scripts/**"],
  },
  // Skip static generation for pages that use useSearchParams
  generateBuildId: async () => {
    return "build-id";
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(config);
