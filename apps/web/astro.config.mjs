import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://kavtsya.com",
  // Small static pages: inlined CSS renders faster than blocking requests.
  build: { inlineStylesheets: "always" },
  image: {
    // Rasterizes the brand mark into the touch icon and social preview. The only
    // SVG sources are our own assets, so the untrusted-SVG risk does not apply.
    dangerouslyProcessSVG: true,
  },
  vite: {
    // Keep font subsets as cacheable files instead of base64 inside the
    // render-blocking stylesheet.
    build: { assetsInlineLimit: 0 },
  },
});
