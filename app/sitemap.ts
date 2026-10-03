import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://music.purnashrestha.com.np/", lastModified: new Date() }];
}
