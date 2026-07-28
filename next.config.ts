import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const LAB_ORIGIN = "https://examserver-lab-origin.vercel.app";

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/lab",
          destination: `${LAB_ORIGIN}/lab`,
        },
        {
          source: "/lab/:path+",
          destination: `${LAB_ORIGIN}/lab/:path+`,
        },
        {
          source: "/api/lab",
          destination: `${LAB_ORIGIN}/api/lab`,
        },
        {
          source: "/api/lab/:path+",
          destination: `${LAB_ORIGIN}/api/lab/:path+`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  /** Vercel デプロイ時にサーバーレス関数のサイズを抑えるための設定 */
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/@tailwindcss/oxide-win32-*",
      "./node_modules/lightningcss-win32-*",
    ],
    "/learn": ["./data/exams/**/*"],
    "/learn/**/*": ["./data/exams/**/*"],
  },
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
});

export default withMDX(nextConfig);
