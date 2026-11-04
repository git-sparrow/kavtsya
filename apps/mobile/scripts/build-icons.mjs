// Derive every launcher and splash asset from one vector source — the Берегиня
// ornament below — so the committed PNGs stay in lockstep with the mark and can
// be regenerated instead of hand-edited: `pnpm icons:build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../assets",
);

// Theme hexes: secondary-900 (the app's dark background), secondary-950 and
// primary-400.
const INK = "#241b3a"; // canvas
const DEEP = "#1b142c"; // canvas, iOS dark appearance
const GOLD = "#e8b44a"; // the ornament

// The ornament in its 48-unit grid, the same geometry `components/berehynia.tsx`
// draws in-app, so the icon, splash and in-app mark stay one shape.
const GRID = 48;
const STROKE = 2.5;
const ornament = (color) =>
  `<g fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M24 6 L38 24 L24 42 L10 24 Z"/>` +
  `<path d="M24 15 L31 24 L24 33 L17 24 Z" stroke-width="2"/>` +
  `<circle cx="24" cy="24" r="2.4" fill="${color}" stroke="none"/>` +
  `<path d="M10 24 L4 19 M10 24 L4 29"/>` +
  `<path d="M38 24 L44 19 M38 24 L44 29"/>` +
  `<path d="M24 6 L20 1 M24 6 L28 1"/>` +
  `<path d="M24 42 L20 47 M24 42 L28 47"/>` +
  `</g>`;

const svg = (w, h, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;

// The ornament's painted bounds, stroke caps included: the rays reach 1 and 47
// vertically, 4 and 44 horizontally, plus half a stroke.
const bb = {
  x: 4 - STROKE / 2,
  y: 1 - STROKE / 2,
  width: 40 + STROKE,
  height: 46 + STROKE,
};

/** The ornament on a `size` square, its grid scaled to `fill` of the side and centred. */
const centred = (color, fill, size = 1024, bg) => {
  const s = (size * fill) / GRID;
  const t = size / 2 - (GRID / 2) * s;
  return svg(
    size,
    size,
    (bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : "") +
      `<g transform="translate(${t} ${t}) scale(${s})">${ornament(color)}</g>`,
  );
};

/** The ornament cropped to its own bounds plus `pad` (a fraction of its height). */
const cropped = (color, pad) => {
  const m = bb.height * pad;
  return svg(
    bb.width + m * 2,
    bb.height + m * 2,
    `<g transform="translate(${m - bb.x} ${m - bb.y})">${ornament(color)}</g>`,
  );
};

const render = (file, markup, width) => {
  const png = new Resvg(markup, { fitTo: { mode: "width", value: width } })
    .render()
    .asPng();
  fs.writeFileSync(path.join(ASSETS, file), png);
  console.log(
    `  ${file.padEnd(38)} ${png.length.toLocaleString().padStart(9)} B`,
  );
};

// The approved reference draws the grid at 19.6 units per 1200px.
const ICON_FILL = (GRID * 19.6) / 1200;
console.log("icon:");
// `ios.icon.light` reuses this one — the light appearance is the base icon.
render("images/icon.png", centred(GOLD, ICON_FILL, 1024, INK), 1024);
render("images/ios-icon-dark.png", centred(GOLD, ICON_FILL, 1024, DEEP), 1024);
// iOS grades the tinted appearance by luminance onto the Customer's chosen tint,
// so this variant is greyscale, not gold.
render(
  "images/ios-icon-tinted.png",
  centred("#ffffff", ICON_FILL, 1024, "#000000"),
  1024,
);

// What has to clear Android's 66dp safe circle (r = 11/36 of the 108dp canvas)
// is the reach of the top and bottom ray tips: 23.35 grid units from the centre
// plus the stroke cap. At this fill that is r = 0.287 of the canvas, inside 0.306.
const SAFE_ZONE_FILL = 0.56;
console.log("android adaptive:");
render(
  "images/android-icon-foreground.png",
  centred(GOLD, SAFE_ZONE_FILL),
  1024,
);
render(
  "images/android-icon-monochrome.png",
  centred("#ffffff", SAFE_ZONE_FILL),
  1024,
);

// Cropped to the ornament so `imageWidth` in the splash config means its own
// width. Light draws it in ink so it holds contrast on the cream background;
// dark is the icon's own gold.
console.log("splash:");
render("images/splash-icon.png", cropped(INK, 0.03), 900);
render("images/splash-icon-dark.png", cropped(GOLD, 0.03), 900);

// The mark itself, kept readable and hand-off-able — this is what to feed a
// design tool (Icon Composer, Figma) rather than the raster output.
console.log("brand:");
fs.writeFileSync(
  path.join(ASSETS, "brand/kavtsya-mark.svg"),
  centred(GOLD, ICON_FILL, 1024, INK) + "\n",
);
console.log("  brand/kavtsya-mark.svg");
