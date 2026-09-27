import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register", "/forgot-password", "/activate"],
        disallow: [
          "/admin/",
          "/employee/",
          "/candidate/",
          "/api/",
          "/_next/",
        ],
      },
      {
        // Disallow aggressive AI / commercial scrapers from harvesting data
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "CCBot",
          "anthropic-ai",
          "Claude-Web",
          "Bytespider",
          "Scrapy",
        ],
        disallow: ["/"],
      },
    ],
  };
}
