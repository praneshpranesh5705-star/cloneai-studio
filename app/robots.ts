import type { MetadataRoute } from "next";

/**
 * The app is a private workspace behind auth, so only the public entry points
 * are worth indexing. Everything else is disallowed — there is nothing for a
 * crawler to see there but a login redirect.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup"],
        disallow: [
          "/agents",
          "/knowledge",
          "/settings",
          "/usage",
          "/studios",
          "/api/",
          "/auth/",
        ],
      },
    ],
    sitemap: "https://cloneai-studio.vercel.app/sitemap.xml",
  };
}
