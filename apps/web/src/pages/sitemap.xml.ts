import type { APIRoute } from "astro";
import { PAGES } from "../site";

export const GET: APIRoute = ({ site }) => {
  const urls = Object.values(PAGES)
    .map(({ path }) => `  <url><loc>${new URL(path, site).href}</loc></url>`)
    .join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
